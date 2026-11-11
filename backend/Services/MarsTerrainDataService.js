const CONFIG = require('./TerrainNavigationConfig');
const {
  createLocalGridGeometry,
  gridCellToCoordinate
} = require('./MarsTerrainAnalysis');
const { getMarsElevations } = require('./MarsPlacesService');

let metadataRequest = null;

async function getMarsMolaMetadata() {
  if (!metadataRequest) {
    metadataRequest = (async () => {
      const response = await fetch(
        `${CONFIG.nasaMola.serviceUrl}?f=pjson`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(15000)
        }
      );
      if (!response.ok) {
        throw new Error(`NASA MOLA metadata returned HTTP ${response.status}.`);
      }
      const metadata = await response.json();
      if (
        metadata.error ||
        !Number.isFinite(metadata.pixelSizeX) ||
        !Number.isFinite(metadata.pixelSizeY) ||
        !Number.isFinite(metadata.spatialReference?.wkid)
      ) {
        throw new Error('NASA MOLA returned incomplete raster metadata.');
      }

      return {
        serviceName: metadata.name,
        width: null,
        height: null,
        pixelSizeXDegrees: metadata.pixelSizeX,
        pixelSizeYDegrees: metadata.pixelSizeY,
        pixelType: metadata.pixelType,
        bandCount: metadata.bandCount,
        spatialReference: metadata.spatialReference,
        extent: metadata.fullExtent,
        elevationUnits: CONFIG.nasaMola.expectedElevationUnits,
        noDataValue:
          metadata.noDataValue ??
          metadata.noDataValues?.[0] ??
          metadata.noDataValueForBand1 ??
          null,
        minimumElevationMeters:
          metadata.minValues?.[0] ??
          CONFIG.nasaMola.minimumElevationMeters,
        maximumElevationMeters:
          metadata.maxValues?.[0] ??
          CONFIG.nasaMola.maximumElevationMeters
      };
    })().catch((error) => {
      metadataRequest = null;
      throw error;
    });
  }
  return metadataRequest;
}

async function loadMarsMolaGrid(start, destination, options = {}) {
  const rasterMetadata = await getMarsMolaMetadata();
  const grid = createLocalGridGeometry(start, destination, options);
  const samplePoints = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      samplePoints.push(gridCellToCoordinate(grid, row, column));
    }
  }

  const samples = await getMarsElevations(samplePoints, {
    interpolation: options.interpolation || 'RSP_NearestNeighbor'
  });
  const validSamples = samples.filter(Number.isFinite).length;
  if (validSamples === 0) {
    throw new Error('NASA MOLA returned no valid elevation samples for this route.');
  }

  const metersPerDegree = Math.PI / 180 * CONFIG.marsEquatorialRadiusMeters;
  const sourceResolutionMeters =
    Math.sqrt(
      rasterMetadata.pixelSizeXDegrees *
        metersPerDegree *
        Math.cos(grid.centerLatitude * Math.PI / 180) *
        rasterMetadata.pixelSizeYDegrees *
        metersPerDegree
    );
  grid.elevations = samples;

  return {
    grid,
    metadata: {
      dataSource: 'NASA Mars Trek MOLA/HRSC blended DEM ImageServer',
      coordinateSystem: `Geographic Mars datum WKID ${rasterMetadata.spatialReference.wkid}`,
      spatialReference: rasterMetadata.spatialReference,
      elevationUnits: rasterMetadata.elevationUnits,
      pixelType: rasterMetadata.pixelType,
      bandCount: rasterMetadata.bandCount,
      noDataValue: rasterMetadata.noDataValue,
      sourceResolutionMeters,
      nativePixelSizeDegrees: {
        x: rasterMetadata.pixelSizeXDegrees,
        y: rasterMetadata.pixelSizeYDegrees
      },
      validSampleCount: validSamples,
      totalSampleCount: samples.length,
      coveragePercent: (100 * validSamples) / samples.length,
      samplingMethod: `NASA ArcGIS ImageServer getSamples, ${options.interpolation || 'nearest neighbour'}`
    }
  };
}

module.exports = { getMarsMolaMetadata, loadMarsMolaGrid };
