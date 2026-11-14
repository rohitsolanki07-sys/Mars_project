const CONFIG = require('./TerrainNavigationConfig');

const DEG_TO_RAD = Math.PI / 180;
const MAX_GRID_LATITUDE = 89.999;
const TERRAIN_STATES = Object.freeze({
  SAFE: 'SAFE_CANDIDATE',
  CAUTION: 'CAUTION',
  HIGH_RISK: 'HIGH_RISK',
  RESTRICTED: 'RESTRICTED',
  UNKNOWN: 'UNKNOWN'
});

function isValidCoordinate(point) {
  return Boolean(
    point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function normalizeLongitudeDelta(delta) {
  return ((delta + 540) % 360) - 180;
}

function createLocalGridGeometry(start, destination, options = {}) {
  if (!isValidCoordinate(start) || !isValidCoordinate(destination)) {
    throw new TypeError('Start and destination must be valid Mars coordinates.');
  }

  const requestedResolution =
    options.resolutionMeters ?? CONFIG.grid.defaultResolutionMeters;
  if (
    !Number.isFinite(requestedResolution) ||
    requestedResolution < CONFIG.grid.minimumResolutionMeters ||
    requestedResolution > CONFIG.grid.maximumResolutionMeters
  ) {
    throw new RangeError(
      `Grid resolution must be between ${CONFIG.grid.minimumResolutionMeters} and ${CONFIG.grid.maximumResolutionMeters} metres.`
    );
  }
  const endpointSearchRangeMeters =
    options.endpointSearchRangeMeters ?? 0;
  if (
    !Number.isFinite(endpointSearchRangeMeters) ||
    endpointSearchRangeMeters < 0 ||
    endpointSearchRangeMeters > CONFIG.endpoints.maximumSnapDistanceMeters
  ) {
    throw new RangeError(
      `Endpoint search range must be between 0 and ${CONFIG.endpoints.maximumSnapDistanceMeters} metres.`
    );
  }

  const centerLatitude = (start.latitude + destination.latitude) / 2;
  const centerLongitude =
    start.longitude +
    normalizeLongitudeDelta(destination.longitude - start.longitude) / 2;
  const latitudeScale = CONFIG.marsEquatorialRadiusMeters;
  const longitudeScale =
    latitudeScale * Math.max(Math.cos(centerLatitude * DEG_TO_RAD), 0.01);
  const toLocal = (coordinate) => ({
    x:
      normalizeLongitudeDelta(coordinate.longitude - centerLongitude) *
      DEG_TO_RAD *
      longitudeScale,
    y:
      (coordinate.latitude - centerLatitude) *
      DEG_TO_RAD *
      latitudeScale
  });
  const startLocal = toLocal(start);
  const destinationLocal = toLocal(destination);
  const padding = Math.max(
    requestedResolution * CONFIG.grid.paddingCells,
    endpointSearchRangeMeters
  );
  const minX = Math.min(startLocal.x, destinationLocal.x) - padding;
  const maxX = Math.max(startLocal.x, destinationLocal.x) + padding;
  const minY = Math.min(startLocal.y, destinationLocal.y) - padding;
  const maxY = Math.max(startLocal.y, destinationLocal.y) + padding;
  const maxIntervals = CONFIG.grid.maximumDimension - 1;
  const resolutionMeters = Math.max(
    requestedResolution,
    (maxX - minX) / maxIntervals,
    (maxY - minY) / maxIntervals
  );
  const columns = Math.ceil((maxX - minX) / resolutionMeters) + 1;
  const rows = Math.ceil((maxY - minY) / resolutionMeters) + 1;

  if (rows * columns > CONFIG.grid.maximumDimension ** 2) {
    throw new RangeError('The requested route area exceeds the terrain grid limit.');
  }

  const grid = {
    rows,
    columns,
    resolutionMeters,
    centerLatitude,
    centerLongitude,
    minX,
    maxY,
    longitudeScale,
    latitudeScale,
    start,
    destination
  };
  grid.startCell = coordinateToGridCell(grid, start);
  grid.destinationCell = coordinateToGridCell(grid, destination);
  return grid;
}

function coordinateToGridCell(grid, coordinate) {
  const longitudeDelta = normalizeLongitudeDelta(
    coordinate.longitude - grid.centerLongitude
  );
  const localX = longitudeDelta * DEG_TO_RAD * grid.longitudeScale;
  const localY =
    (coordinate.latitude - grid.centerLatitude) * DEG_TO_RAD * grid.latitudeScale;
  return {
    row: Math.max(
      0,
      Math.min(
        grid.rows - 1,
        Math.round((grid.maxY - localY) / grid.resolutionMeters)
      )
    ),
    column: Math.max(
      0,
      Math.min(
        grid.columns - 1,
        Math.round((localX - grid.minX) / grid.resolutionMeters)
      )
    )
  };
}

function gridCellToCoordinate(grid, row, column) {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    row >= grid.rows ||
    column < 0 ||
    column >= grid.columns
  ) {
    throw new RangeError('Grid row or column is outside the terrain grid.');
  }
  const localX = grid.minX + column * grid.resolutionMeters;
  const localY = grid.maxY - row * grid.resolutionMeters;
  return {
    latitude:
      Math.max(
        -MAX_GRID_LATITUDE,
        Math.min(
          MAX_GRID_LATITUDE,
          grid.centerLatitude +
            localY / grid.latitudeScale / DEG_TO_RAD
        )
      ),
    longitude:
      ((grid.centerLongitude +
        localX / grid.longitudeScale / DEG_TO_RAD +
        540) %
        360) -
      180
  };
}

function rasterCoordinateToCell(metadata, latitude, longitude) {
  if (
    !metadata ||
    !Number.isInteger(metadata.width) ||
    !Number.isInteger(metadata.height) ||
    !Number.isFinite(metadata.xmin) ||
    !Number.isFinite(metadata.ymax) ||
    !Number.isFinite(metadata.pixelSizeX) ||
    !Number.isFinite(metadata.pixelSizeY) ||
    metadata.pixelSizeX === 0 ||
    metadata.pixelSizeY === 0
  ) {
    throw new TypeError('Raster metadata must include dimensions, origin, and pixel sizes.');
  }
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new TypeError('Latitude and longitude must be valid geographic coordinates.');
  }

  const column = Math.floor(
    (longitude -
      (metadata.originX ??
        (metadata.pixelSizeX > 0 ? metadata.xmin : metadata.xmax))) /
      metadata.pixelSizeX
  );
  const row = Math.floor(
    metadata.originY !== undefined
      ? (latitude - metadata.originY) / metadata.pixelSizeY
      : (metadata.ymax - latitude) / Math.abs(metadata.pixelSizeY)
  );
  if (!Number.isFinite(column) || !Number.isFinite(row)) return null;
  if (
    row < 0 ||
    row >= metadata.height ||
    column < 0 ||
    column >= metadata.width
  ) {
    return null;
  }
  return { row, column };
}

function getElevation(grid, row, column) {
  if (
    row < 0 ||
    row >= grid.rows ||
    column < 0 ||
    column >= grid.columns
  ) {
    return null;
  }
  const value = grid.elevations[row * grid.columns + column];
  return Number.isFinite(value) ? value : null;
}

function getAxisGradient(center, before, after, spacing) {
  if (before !== null && after !== null) {
    return (after - before) / (spacing * 2);
  }
  if (after !== null) return (after - center) / spacing;
  if (before !== null) return (center - before) / spacing;
  return null;
}

function terrainRiskPenalty(value, thresholds) {
  if (value <= thresholds.preferred) return CONFIG.costWeights.preferred;
  if (value <= thresholds.caution) return CONFIG.costWeights.caution;
  if (value <= thresholds.highRisk) return CONFIG.costWeights.highRisk;
  return CONFIG.costWeights.severe;
}

function getCraterDepthThresholdMeters(grid) {
  const config = CONFIG.craterDetection;
  return Math.max(
    config.minimumDepthMeters,
    grid.resolutionMeters * config.minimumDepthPerCellMeters
  );
}

function getDepressionRing(grid, row, column, radiusCells, gradientX, gradientY) {
  const elevation = getElevation(grid, row, column);
  const latitude = gridCellToCoordinate(grid, row, column).latitude;
  const eastSpacing =
    grid.resolutionMeters *
    Math.cos(latitude * DEG_TO_RAD) /
    Math.max(Math.cos(grid.centerLatitude * DEG_TO_RAD), 0.01);
  const halfWidth = CONFIG.craterDetection.annulusHalfWidthCells;
  const searchRadius = Math.ceil(radiusCells + halfWidth);
  const sectorTotals = new Array(8).fill(0);
  const sectorCounts = new Array(8).fill(0);

  for (let rowOffset = -searchRadius; rowOffset <= searchRadius; rowOffset += 1) {
    for (
      let columnOffset = -searchRadius;
      columnOffset <= searchRadius;
      columnOffset += 1
    ) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const offsetX = columnOffset * eastSpacing;
      const offsetY = rowOffset * grid.resolutionMeters;
      const distanceCells =
        Math.hypot(offsetX, offsetY) / grid.resolutionMeters;
      if (Math.abs(distanceCells - radiusCells) > halfWidth) continue;

      const sample = getElevation(
        grid,
        row + rowOffset,
        column + columnOffset
      );
      if (sample === null) continue;
      const expectedElevation =
        elevation + gradientX * offsetX + gradientY * offsetY;
      const sector = Math.floor(
        (Math.atan2(offsetY, offsetX) + Math.PI + Math.PI / 8) /
          (Math.PI / 4)
      ) % 8;
      sectorTotals[sector] += sample - expectedElevation;
      sectorCounts[sector] += 1;
    }
  }

  const sectorMeans = sectorTotals
    .map((total, sector) =>
      sectorCounts[sector] > 0 ? total / sectorCounts[sector] : null
    )
    .filter(Number.isFinite);
  return {
    elevatedSectors: sectorMeans.filter(
      (difference) =>
        difference >= getCraterDepthThresholdMeters(grid)
    ).length,
    meanRelief:
      sectorMeans.length > 0
        ? sectorMeans.reduce((sum, difference) => sum + difference, 0) /
          sectorMeans.length
        : null
  };
}

function applyCraterDepressionMask(grid, cells) {
  const config = CONFIG.craterDetection;
  const maximumRadiusCells =
    Math.max(...config.annulusRadiiCells) + config.safetyBufferCells;
  const maskBuffer = config.safetyBufferCells;
  const minimumDepthMeters = getCraterDepthThresholdMeters(grid);
  const candidates = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const elevation = getElevation(grid, row, column);
      if (elevation === null) continue;

      const latitude = gridCellToCoordinate(grid, row, column).latitude;
      const eastSpacing =
        grid.resolutionMeters *
        Math.cos(latitude * DEG_TO_RAD) /
        Math.max(Math.cos(grid.centerLatitude * DEG_TO_RAD), 0.01);
      const gradientX = getAxisGradient(
        elevation,
        getElevation(grid, row, column - 1),
        getElevation(grid, row, column + 1),
        eastSpacing
      );
      const gradientY = getAxisGradient(
        elevation,
        getElevation(grid, row - 1, column),
        getElevation(grid, row + 1, column),
        grid.resolutionMeters
      );
      if (gradientX === null || gradientY === null) continue;

      const rings = config.annulusRadiiCells.map((radiusCells) => ({
        radiusCells,
        ...getDepressionRing(
          grid,
          row,
          column,
          radiusCells,
          gradientX,
          gradientY
        )
      }));
      let depression = null;
      for (let index = 0; index < rings.length; index += 1) {
        const ring = rings[index];
        if (
          ring.elevatedSectors < config.minimumElevatedSectors ||
          ring.meanRelief < minimumDepthMeters
        ) {
          continue;
        }
        const nextRing = rings[index + 1];
        if (!nextRing || nextRing.meanRelief === null ||
            nextRing.meanRelief <= ring.meanRelief) {
          depression = ring;
          break;
        }
        depression = ring;
      }
      if (depression) {
        candidates.push({ row, column, ...depression });
      }
    }
  }

  for (const candidate of candidates) {
    const latitude = gridCellToCoordinate(
      grid,
      candidate.row,
      candidate.column
    ).latitude;
    const eastSpacing =
      grid.resolutionMeters *
      Math.cos(latitude * DEG_TO_RAD) /
      Math.max(Math.cos(grid.centerLatitude * DEG_TO_RAD), 0.01);
    const radiusCells = Math.min(
      maximumRadiusCells,
      candidate.radiusCells + maskBuffer
    );
    const searchRadius = Math.ceil(radiusCells);

    for (
      let rowOffset = -searchRadius;
      rowOffset <= searchRadius;
      rowOffset += 1
    ) {
      for (
        let columnOffset = -searchRadius;
        columnOffset <= searchRadius;
        columnOffset += 1
      ) {
        const distanceMeters = Math.hypot(
          rowOffset * grid.resolutionMeters,
          columnOffset * eastSpacing
        );
        if (distanceMeters > radiusCells * grid.resolutionMeters) continue;
        const row = candidate.row + rowOffset;
        const column = candidate.column + columnOffset;
        const index = row * grid.columns + column;
        if (
          row < 0 ||
          row >= grid.rows ||
          column < 0 ||
          column >= grid.columns ||
          cells[index].state === TERRAIN_STATES.UNKNOWN
        ) {
          continue;
        }
        cells[index].blockedByCrater = true;
        cells[index].craterDepthMeters = Math.max(
          cells[index].craterDepthMeters,
          candidate.meanRelief
        );
        cells[index].craterRadiusMeters = Math.max(
          cells[index].craterRadiusMeters,
          candidate.radiusCells * grid.resolutionMeters
        );
        cells[index].state = TERRAIN_STATES.RESTRICTED;
      }
    }
  }
}

function analyzeTerrain(grid, hazards = [], geologyZones = []) {
  const totalCells = grid.rows * grid.columns;
  if (
    grid.elevations.length !== totalCells ||
    grid.elevations.some((elevation) =>
      Number.isFinite(elevation)
        ? elevation < CONFIG.nasaMola.minimumElevationMeters ||
          elevation > CONFIG.nasaMola.maximumElevationMeters
        : elevation !== null
    )
  ) {
    throw new TypeError(
      'Terrain elevations must match the grid and use null for missing or NoData cells.'
    );
  }
  if (!Array.isArray(hazards)) {
    throw new TypeError('Hazards must be supplied as an array.');
  }
  if (!Array.isArray(geologyZones)) {
    throw new TypeError('Geology zones must be supplied as an array.');
  }

  const cellAnalysis = Array.from({ length: totalCells }, () => ({
    slopeDegrees: null,
    roughnessMeters: null,
    maxElevationChangeMeters: null,
    state: TERRAIN_STATES.UNKNOWN,
    slopePenalty: Infinity,
    roughnessPenalty: Infinity,
    elevationChangePenalty: Infinity,
    costScore: Infinity,
    hazardPenalty: 0,
    geologyPenalty: 1,
    geologyCategories: [],
    blockedByHazard: false,
    blockedByCrater: false,
    craterDepthMeters: 0,
    craterRadiusMeters: 0
  }));
  const terrainConfig = CONFIG.terrain;
  const thresholdScale = Math.max(
    1,
    grid.resolutionMeters / CONFIG.grid.defaultResolutionMeters
  );
  const roughnessThresholds = Object.fromEntries(
    Object.entries(terrainConfig.roughnessMeters).map(([level, threshold]) => [
      level,
      threshold * thresholdScale
    ])
  );
  const elevationChangeThresholds = Object.fromEntries(
    Object.entries(terrainConfig.elevationChangeMeters).map(([level, threshold]) => [
      level,
      threshold * thresholdScale
    ])
  );
  const roughnessRadius =
    terrainConfig.roughnessNeighborhoodRadiusCells;

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const index = row * grid.columns + column;
      const elevation = getElevation(grid, row, column);
      if (elevation === null) continue;

      const latitude = gridCellToCoordinate(grid, row, column).latitude;
      const eastSpacing =
        grid.resolutionMeters *
        Math.cos(latitude * DEG_TO_RAD) /
        Math.max(Math.cos(grid.centerLatitude * DEG_TO_RAD), 0.01);
      const dzdx = getAxisGradient(
        elevation,
        getElevation(grid, row, column - 1),
        getElevation(grid, row, column + 1),
        eastSpacing
      );
      const dzdy = getAxisGradient(
        elevation,
        getElevation(grid, row - 1, column),
        getElevation(grid, row + 1, column),
        grid.resolutionMeters
      );
      const sampleValues = [];
      let maxElevationChangeMeters = 0;
      for (let rowOffset = -roughnessRadius; rowOffset <= roughnessRadius; rowOffset += 1) {
        for (
          let columnOffset = -roughnessRadius;
          columnOffset <= roughnessRadius;
          columnOffset += 1
        ) {
          const sample = getElevation(
            grid,
            row + rowOffset,
            column + columnOffset
          );
          if (sample === null) continue;
          const expectedElevation =
            elevation +
            dzdx * columnOffset * eastSpacing +
            dzdy * rowOffset * grid.resolutionMeters;
          const localRelief = sample - expectedElevation;
          sampleValues.push(localRelief);
          maxElevationChangeMeters = Math.max(
            maxElevationChangeMeters,
            Math.abs(localRelief)
          );
        }
      }

      if (dzdx === null || dzdy === null || sampleValues.length < 2) continue;
      const mean =
        sampleValues.reduce((sum, value) => sum + value, 0) /
        sampleValues.length;
      const roughnessMeters = Math.sqrt(
        sampleValues.reduce(
          (sum, value) => sum + (value - mean) ** 2,
          0
        ) / sampleValues.length
      );
      cellAnalysis[index] = {
        slopeDegrees:
          (Math.atan(Math.hypot(dzdx, dzdy)) / DEG_TO_RAD),
        roughnessMeters,
        maxElevationChangeMeters,
        state: TERRAIN_STATES.SAFE,
        slopePenalty: CONFIG.costWeights.preferred,
        costScore: 0,
        hazardPenalty: 0,
        geologyPenalty: 1,
        geologyCategories: [],
        blockedByHazard: false,
        blockedByCrater: false,
        craterDepthMeters: 0,
        craterRadiusMeters: 0
      };
    }
  }

  applyHazards(grid, cellAnalysis, hazards);
  applyGeologyZones(grid, cellAnalysis, geologyZones);
  cellAnalysis.forEach((cell) => {
    if (cell.state === TERRAIN_STATES.UNKNOWN) return;
    const slope = cell.slopeDegrees;
    const roughness = cell.roughnessMeters;
    const elevationChange = cell.maxElevationChangeMeters;
    cell.slopePenalty =
      slope <= terrainConfig.slopeDegrees.preferred
        ? CONFIG.costWeights.preferred
        : slope <= terrainConfig.slopeDegrees.caution
          ? CONFIG.costWeights.caution
          : slope <= terrainConfig.slopeDegrees.highRisk
            ? CONFIG.costWeights.highRisk
            : Infinity;
    cell.roughnessPenalty = terrainRiskPenalty(
      roughness,
      roughnessThresholds
    );
    cell.elevationChangePenalty = terrainRiskPenalty(
      elevationChange,
      elevationChangeThresholds
    );
    if (
      slope > terrainConfig.slopeDegrees.highRisk ||
      elevationChange > elevationChangeThresholds.highRisk ||
      cell.blockedByHazard
    ) {
      cell.state = TERRAIN_STATES.RESTRICTED;
    } else if (
      slope > terrainConfig.slopeDegrees.caution ||
      roughness > roughnessThresholds.caution ||
      elevationChange > elevationChangeThresholds.caution
    ) {
      cell.state = TERRAIN_STATES.HIGH_RISK;
    } else if (
      slope > terrainConfig.slopeDegrees.preferred ||
      roughness > roughnessThresholds.preferred ||
      elevationChange > elevationChangeThresholds.preferred
    ) {
      cell.state = TERRAIN_STATES.CAUTION;
    }

    cell.costScore =
      cell.slopePenalty +
      cell.geologyPenalty +
      cell.roughnessPenalty +
      cell.elevationChangePenalty +
      cell.hazardPenalty;
  });

  applyCraterDepressionMask(grid, cellAnalysis);
  return cellAnalysis;
}

function applyGeologyZones(grid, cells, zones) {
  if (zones.length > 1000) {
    throw new RangeError('No more than 1,000 geology zones may be used for a route.');
  }
  for (const zone of zones) {
    if (
      !zone ||
      typeof zone !== 'object' ||
      !Array.isArray(zone.polygon) ||
      zone.polygon.length < 3
    ) {
      throw new TypeError('Each geology zone must include a polygon with at least three points.');
    }
    const polygon = zone.polygon.map((coordinate) => {
      if (!isValidCoordinate(coordinate)) {
        throw new TypeError('Geology-zone polygon coordinates must be valid.');
      }
      return toLocalPosition(grid, coordinate);
    });
    const category = String(zone.category || '').toLowerCase();
    const isHazard = isImpassableGeologyCategory(category);
    const geologyPenalty =
      category.includes('ejecta') || category.includes('highland')
        ? 3
        : 1;

    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const index = row * grid.columns + column;
        const cell = cells[index];
        if (cell.state === TERRAIN_STATES.UNKNOWN) continue;
        const local = {
          x: grid.minX + column * grid.resolutionMeters,
          y: grid.maxY - row * grid.resolutionMeters
        };
        if (!pointInPolygon(local, polygon)) continue;
        if (isHazard) {
          cell.blockedByHazard = true;
          cell.hazardPenalty = 0;
          cell.state = TERRAIN_STATES.RESTRICTED;
        } else {
          cell.geologyPenalty = Math.max(
            cell.geologyPenalty,
            geologyPenalty
          );
        }
        if (zone.category && !cell.geologyCategories.includes(zone.category)) {
          cell.geologyCategories.push(zone.category);
        }
      }
    }
  }
}

function isImpassableGeologyCategory(category) {
  const normalizedCategory = String(category || '').toLowerCase();
  return (
    normalizedCategory === 'hazard' ||
    normalizedCategory.includes('dune') ||
    normalizedCategory.includes('bedform')
  );
}

function thermalTransitionPenalty(colors, fromIndex, toIndex) {
  if (!Array.isArray(colors)) return 0;
  const from = colors[fromIndex];
  const to = colors[toIndex];
  if (
    !Array.isArray(from) ||
    !Array.isArray(to) ||
    from.length !== 3 ||
    to.length !== 3
  ) {
    return 0;
  }
  const squaredDifference = from.reduce(
    (sum, channel, index) => sum + (channel - to[index]) ** 2,
    0
  );
  return Math.sqrt(squaredDifference / (3 * 255 ** 2));
}

function applyHazards(grid, cells, hazards) {
  for (const hazard of hazards) {
    if (!hazard || typeof hazard !== 'object') {
      throw new TypeError('Each hazard must be an object.');
    }
    const isPolygon = Array.isArray(hazard.polygon);
    const center = hazard.center || {
      latitude: hazard.latitude ?? hazard.coords?.[0],
      longitude: hazard.longitude ?? hazard.coords?.[1]
    };
    const radiusMeters = hazard.radiusMeters ?? hazard.radius_meters ?? 0;
    const bufferMeters = hazard.bufferMeters ?? CONFIG.hazards.defaultBufferMeters;
    const restricted = hazard.restricted !== false;
    if (
      (!isPolygon && !isValidCoordinate(center)) ||
      !Number.isFinite(radiusMeters) ||
      radiusMeters < 0 ||
      !Number.isFinite(bufferMeters) ||
      bufferMeters < CONFIG.hazards.minimumBufferMeters ||
      bufferMeters > CONFIG.hazards.maximumBufferMeters
    ) {
      throw new TypeError('Hazards must include a valid location, radius, and buffer.');
    }

    const centerLocal = isPolygon ? null : toLocalPosition(grid, center);
    const polygonLocal = isPolygon
      ? hazard.polygon.map((coordinate) => {
          if (!isValidCoordinate(coordinate)) {
            throw new TypeError('Hazard polygon coordinates must be valid.');
          }
          return toLocalPosition(grid, coordinate);
        })
      : null;
    if (isPolygon && polygonLocal.length < 3) {
      throw new TypeError('Hazard polygons need at least three coordinates.');
    }

    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const index = row * grid.columns + column;
        const cell = cells[index];
        if (cell.state === TERRAIN_STATES.UNKNOWN) continue;
        const local = {
          x: grid.minX + column * grid.resolutionMeters,
          y: grid.maxY - row * grid.resolutionMeters
        };
        let distance;
        if (isPolygon) {
          const inside = pointInPolygon(local, polygonLocal);
          distance = inside ? 0 : distanceToPolygon(local, polygonLocal);
        } else {
          distance = Math.hypot(
            local.x - centerLocal.x,
            local.y - centerLocal.y
          );
        }
        if (distance <= radiusMeters + bufferMeters) {
          cell.hazardPenalty = restricted ? 0 : CONFIG.costWeights.softHazard;
          cell.blockedByHazard = restricted;
          if (restricted) cell.state = TERRAIN_STATES.RESTRICTED;
        }
      }
    }
  }
}

function toLocalPosition(grid, coordinate) {
  return {
    x:
      normalizeLongitudeDelta(coordinate.longitude - grid.centerLongitude) *
      DEG_TO_RAD *
      grid.longitudeScale,
    y:
      (coordinate.latitude - grid.centerLatitude) *
      DEG_TO_RAD *
      grid.latitudeScale
  };
}

function coordinateInsideRestrictedHazard(
  grid,
  coordinate,
  hazards,
  geologyZones = []
) {
  const local = toLocalPosition(grid, coordinate);
  const insideHazard = hazards.some((hazard) => {
    if (hazard.restricted === false) return false;
    const bufferMeters = hazard.bufferMeters ?? CONFIG.hazards.defaultBufferMeters;
    const radiusMeters = hazard.radiusMeters ?? hazard.radius_meters ?? 0;
    if (Array.isArray(hazard.polygon)) {
      const polygon = hazard.polygon.map((point) => toLocalPosition(grid, point));
      return (
        pointInPolygon(local, polygon) ||
        distanceToPolygon(local, polygon) <= radiusMeters + bufferMeters
      );
    }
    const center = hazard.center || {
      latitude: hazard.latitude ?? hazard.coords?.[0],
      longitude: hazard.longitude ?? hazard.coords?.[1]
    };
    const centerLocal = toLocalPosition(grid, center);
    return (
      Math.hypot(local.x - centerLocal.x, local.y - centerLocal.y) <=
      radiusMeters + bufferMeters
    );
  });
  if (insideHazard) return true;
  return geologyZones.some((zone) => {
    if (
      !isImpassableGeologyCategory(zone.category) ||
      !Array.isArray(zone.polygon)
    ) {
      return false;
    }
    return pointInPolygon(
      local,
      zone.polygon.map((point) => toLocalPosition(grid, point))
    );
  });
}

function findNearestTraversableCell(grid, cells, coordinate) {
  const maximumDistance = Math.max(
    CONFIG.endpoints.maximumSnapDistanceMeters,
    grid.resolutionMeters
  );
  const originCell = coordinateToGridCell(grid, coordinate);
  const searchRadius = Math.ceil(maximumDistance / grid.resolutionMeters);
  let nearest = null;

  for (
    let row = Math.max(0, originCell.row - searchRadius);
    row <= Math.min(grid.rows - 1, originCell.row + searchRadius);
    row += 1
  ) {
    for (
      let column = Math.max(0, originCell.column - searchRadius);
      column <= Math.min(grid.columns - 1, originCell.column + searchRadius);
      column += 1
    ) {
      const index = row * grid.columns + column;
      if (!isCellTraversable(cells[index])) continue;
      const cellCoordinate = gridCellToCoordinate(grid, row, column);
      const distance = surfaceDistanceMeters(coordinate, cellCoordinate);
      if (distance > maximumDistance || (nearest && distance >= nearest.distance)) {
        continue;
      }
      nearest = {
        cell: { row, column },
        coordinate: cellCoordinate,
        distance
      };
    }
  }

  return nearest;
}

// Search the entire grid for the nearest traversable cell,
// ignoring the fixed snap-distance limit. Used when no traversable
// cell exists within the normal snap radius.
function findNearestTraversableAnywhere(grid, cells, coordinate) {
  const originCell = coordinateToGridCell(grid, coordinate);
  let nearest = null;
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      if (!isCellTraversable(cells[row * grid.columns + column])) continue;
      const cellCoord = gridCellToCoordinate(grid, row, column);
      const dist = surfaceDistanceMeters(coordinate, cellCoord);
      if (!nearest || dist < nearest.distance) {
        nearest = { cell: { row, column }, coordinate: cellCoord, distance: dist };
      }
    }
  }
  return nearest;
}

// Build a straight great-circle chain of grid cells from start to destination.
// Used as the last-resort fallback when A* cannot find any grid-based path.
function buildDirectChain(grid) {
  const steps = Math.max(
    2,
    Math.ceil(surfaceDistanceMeters(grid.start, grid.destination) / grid.resolutionMeters)
  );
  const path = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const lat = grid.start.latitude + t * (grid.destination.latitude - grid.start.latitude);
    const lonDelta = normalizeLongitudeDelta(grid.destination.longitude - grid.start.longitude);
    const lon = grid.start.longitude + t * lonDelta;
    path.push(coordinateToGridCell(grid, { latitude: lat, longitude: lon }));
  }
  // Deduplicate consecutive identical cells.
  return path.filter(
    (cell, i) =>
      i === 0 || cell.row !== path[i - 1].row || cell.column !== path[i - 1].column
  );
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const a = polygon[index];
    const b = polygon[previous];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x <
        ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(point, polygon) {
  let minimumDistance = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fraction = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start.x) * dx + (point.y - start.y) * dy) /
          (dx * dx + dy * dy || 1)
      )
    );
    minimumDistance = Math.min(
      minimumDistance,
      Math.hypot(point.x - (start.x + fraction * dx), point.y - (start.y + fraction * dy))
    );
  }
  return minimumDistance;
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.items[parentIndex].priority <= item.priority) break;
      this.items[index] = this.items[parentIndex];
      index = parentIndex;
    }
    this.items[index] = item;
  }

  pop() {
    if (this.items.length === 0) return null;
    const minimum = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const child =
          right < this.items.length &&
          this.items[right].priority < this.items[left].priority
            ? right
            : left;
        if (this.items[child].priority >= last.priority) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return minimum;
  }

  get size() {
    return this.items.length;
  }
}

function isCellTraversable(cell) {
  return (
    cell.state !== TERRAIN_STATES.UNKNOWN &&
    cell.state !== TERRAIN_STATES.RESTRICTED &&
    !cell.blockedByHazard
  );
}

// Relaxed mode: hazard/geology RESTRICTED cells become passable (at high cost),
// but crater-blocked cells are still excluded.
function isCellTraversableRelaxed(cell) {
  if (cell.state === TERRAIN_STATES.UNKNOWN) return false;
  if (cell.state !== TERRAIN_STATES.RESTRICTED) return true;
  // Keep craters impassable in relaxed mode.
  return !cell.blockedByCrater;
}

// Permissive mode: everything except UNKNOWN is passable.
// Used as a last resort when even relaxed mode cannot find a path.
function isCellTraversablePermissive(cell) {
  return cell.state !== TERRAIN_STATES.UNKNOWN;
}

function findLowestCostPath(grid, cells, thermalColors, traversabilityFn = isCellTraversable) {
  const start = grid.startCell;
  const destination = grid.destinationCell;
  const startIndex = start.row * grid.columns + start.column;
  const destinationIndex =
    destination.row * grid.columns + destination.column;
  if (!traversabilityFn(cells[startIndex])) {
    return null;
  }
  if (!traversabilityFn(cells[destinationIndex])) {
    return null;
  }

  const totalCells = grid.rows * grid.columns;
  const gScore = new Float64Array(totalCells);
  gScore.fill(Infinity);
  const parent = new Int32Array(totalCells);
  parent.fill(-1);
  const closed = new Uint8Array(totalCells);
  const open = new MinHeap();
  const minimumCostScore = minimumCellCostScore(cells, traversabilityFn);
  gScore[startIndex] = 0;
  open.push({
    index: startIndex,
    priority: heuristic(grid, start, destination) * minimumCostScore
  });
  const directions = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1]
  ];

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current.index]) continue;
    if (current.index === destinationIndex) {
      return reconstructPath(parent, destinationIndex, grid.columns);
    }
    closed[current.index] = 1;
    const row = Math.floor(current.index / grid.columns);
    const column = current.index % grid.columns;

    for (const [rowOffset, columnOffset] of directions) {
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (
        nextRow < 0 ||
        nextRow >= grid.rows ||
        nextColumn < 0 ||
        nextColumn >= grid.columns
      ) {
        continue;
      }
      const nextIndex = nextRow * grid.columns + nextColumn;
      if (closed[nextIndex] || !traversabilityFn(cells[nextIndex])) continue;
      if (rowOffset !== 0 && columnOffset !== 0) {
        const horizontalIndex = row * grid.columns + nextColumn;
        const verticalIndex = nextRow * grid.columns + column;
        if (
          !traversabilityFn(cells[horizontalIndex]) ||
          !traversabilityFn(cells[verticalIndex])
        ) {
          continue;
        }
      }

      const currentPosition = {
        row,
        column
      };
      const next = { row: nextRow, column: nextColumn };
      let candidateParent = current.index;
      let tentativeScore =
        gScore[current.index] +
        segmentTraversalCost(
          grid,
          cells,
          currentPosition,
          next,
          thermalColors
        ).cost;
      const currentParentIndex = parent[current.index];
      if (currentParentIndex !== -1) {
        const currentParent = {
          row: Math.floor(currentParentIndex / grid.columns),
          column: currentParentIndex % grid.columns
        };
        const shortcutCost = segmentTraversalCost(
          grid,
          cells,
          currentParent,
          next,
          thermalColors
        ).cost;
        if (Number.isFinite(shortcutCost) &&
            gScore[currentParentIndex] + shortcutCost < tentativeScore) {
          candidateParent = currentParentIndex;
          tentativeScore = gScore[currentParentIndex] + shortcutCost;
        }
      }
      if (tentativeScore >= gScore[nextIndex]) continue;
      parent[nextIndex] = candidateParent;
      gScore[nextIndex] = tentativeScore;
      open.push({
        index: nextIndex,
        priority: tentativeScore + heuristic(grid, next, destination) * minimumCostScore
      });
    }
  }

  return null; // No path found; caller will apply fallback strategy.
}

function minimumCellCostScore(cells, traversabilityFn = isCellTraversable) {
  let minimum = Infinity;
  for (const cell of cells) {
    if (traversabilityFn(cell)) minimum = Math.min(minimum, cell.costScore);
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

function segmentTraversalCost(grid, cells, from, to, thermalColors) {
  const deltaColumn = to.column - from.column;
  const deltaRow = to.row - from.row;
  const stepColumn = Math.sign(deltaColumn);
  const stepRow = Math.sign(deltaRow);
  const absoluteColumn = Math.abs(deltaColumn);
  const absoluteRow = Math.abs(deltaRow);
  const lineDistance =
    Math.hypot(deltaColumn, deltaRow) * grid.resolutionMeters;
  if (lineDistance === 0) {
    return {
      cost: 0,
      terrainCost: 0,
      thermalTransitionScore: 0,
      cellIndices: [from.row * grid.columns + from.column]
    };
  }

  let row = from.row;
  let column = from.column;
  let traversedDistance = 0;
  let weightedTerrainScore = 0;
  let weightedThermalScore = 0;
  let thermalTransitionScore = 0;
  let previousIndex = row * grid.columns + column;
  const cellIndices = [previousIndex];
  while (row !== to.row || column !== to.column) {
    const columnProgress =
      absoluteColumn === 0
        ? Infinity
        : (1 + 2 * Math.abs(column - from.column)) * absoluteRow;
    const rowProgress =
      absoluteRow === 0
        ? Infinity
        : (1 + 2 * Math.abs(row - from.row)) * absoluteColumn;
    const previousRow = row;
    const previousColumn = column;
    if (columnProgress === rowProgress) {
      const sideColumnIndex = row * grid.columns + column + stepColumn;
      const sideRowIndex = (row + stepRow) * grid.columns + column;
      if (
        !isCellTraversable(cells[sideColumnIndex]) ||
        !isCellTraversable(cells[sideRowIndex])
      ) {
        return { cost: Infinity, cellIndices: [] };
      }
      column += stepColumn;
      row += stepRow;
    } else if (columnProgress < rowProgress) {
      column += stepColumn;
    } else {
      row += stepRow;
    }

    if (
      row < 0 ||
      row >= grid.rows ||
      column < 0 ||
      column >= grid.columns
    ) {
      return { cost: Infinity, cellIndices: [] };
    }
    const nextIndex = row * grid.columns + column;
    if (!isCellTraversable(cells[nextIndex])) {
      return { cost: Infinity, cellIndices: [] };
    }
    const stepDistance =
      Math.hypot(column - previousColumn, row - previousRow) *
      grid.resolutionMeters;
    weightedTerrainScore +=
      ((cells[previousIndex].costScore + cells[nextIndex].costScore) / 2) *
      stepDistance;
    const thermalPenalty = thermalTransitionPenalty(
      thermalColors,
      previousIndex,
      nextIndex
    );
    weightedThermalScore += thermalPenalty * stepDistance;
    thermalTransitionScore += thermalPenalty;
    traversedDistance += stepDistance;
    previousIndex = nextIndex;
    cellIndices.push(nextIndex);
  }

  const terrainCost =
    lineDistance * (weightedTerrainScore / traversedDistance);
  const thermalCost =
    lineDistance *
    CONFIG.costWeights.thermalTransition *
    (weightedThermalScore / traversedDistance);
  return {
    cost: terrainCost + thermalCost,
    terrainCost,
    thermalTransitionScore,
    cellIndices
  };
}

function heuristic(grid, from, to) {
  return (
    Math.hypot(
      (to.column - from.column) * grid.resolutionMeters,
      (to.row - from.row) * grid.resolutionMeters
    ) || 0
  );
}

function reconstructPath(parent, destinationIndex, columns) {
  const path = [];
  for (
    let index = destinationIndex;
    index !== -1;
    index = parent[index]
  ) {
    path.push({
      row: Math.floor(index / columns),
      column: index % columns
    });
  }
  return path.reverse();
}

function surfaceDistanceMeters(start, destination) {
  const lat1 = start.latitude * DEG_TO_RAD;
  const lat2 = destination.latitude * DEG_TO_RAD;
  const deltaLat = lat2 - lat1;
  const deltaLon =
    normalizeLongitudeDelta(destination.longitude - start.longitude) *
    DEG_TO_RAD;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;
  return (
    2 *
    CONFIG.marsEquatorialRadiusMeters *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function calculateRoute(
  grid,
  hazards = [],
  metadata = {},
  environment = {}
) {
  const geologyZones = environment.geologyZones || [];
  const thermalColors = environment.thermalInertiaColors;
  if (
    thermalColors !== undefined &&
    (!Array.isArray(thermalColors) ||
      thermalColors.length !== grid.rows * grid.columns ||
      thermalColors.some((color) =>
        color !== null &&
        (!Array.isArray(color) ||
          color.length !== 3 ||
          color.some((channel) =>
            !Number.isInteger(channel) || channel < 0 || channel > 255
          ))
      ))
  ) {
    throw new TypeError('Thermal-inertia colors must match the terrain grid or use null for NoData.');
  }
  const cells = analyzeTerrain(grid, hazards, geologyZones);
  const requestedStart = grid.start;
  const requestedDestination = grid.destination;
  const requestedStartCell = coordinateToGridCell(grid, requestedStart);
  const requestedDestinationCell = coordinateToGridCell(
    grid,
    requestedDestination
  );
  const startNeedsExpandedSearch = !isCellTraversable(
    cells[requestedStartCell.row * grid.columns + requestedStartCell.column]
  );
  const destinationNeedsExpandedSearch = !isCellTraversable(
    cells[
      requestedDestinationCell.row * grid.columns +
        requestedDestinationCell.column
    ]
  );
  // Note endpoint hazard warnings but do not throw — the router will find
  // the safest available path and report the warning to the caller.
  const endpointWarnings = { start: null, destination: null };
  if (coordinateInsideRestrictedHazard(grid, requestedStart, hazards, geologyZones)) {
    endpointWarnings.start = 'Start coordinate is inside a restricted hazard area; routing from nearest safe terrain.';
  }
  if (coordinateInsideRestrictedHazard(grid, requestedDestination, hazards, geologyZones)) {
    endpointWarnings.destination = 'Destination is inside a restricted hazard area; routing to nearest safe terrain.';
  }

  // Snap endpoints to nearest traversable cell. If the strict snap fails,
  // search the whole grid. If the whole grid has no traversable cell, use the
  // nearest grid cell regardless of traversability.
  let start = findNearestTraversableCell(grid, cells, requestedStart);
  if (!start) {
    start = findNearestTraversableAnywhere(grid, cells, requestedStart);
  }
  if (!start) {
    // Absolute fallback: nearest grid cell ignoring traversability.
    const originCell = coordinateToGridCell(grid, requestedStart);
    start = {
      cell: originCell,
      coordinate: gridCellToCoordinate(grid, originCell.row, originCell.column),
      distance: 0
    };
  }
  let destination = findNearestTraversableCell(grid, cells, requestedDestination);
  if (!destination) {
    destination = findNearestTraversableAnywhere(grid, cells, requestedDestination);
  }
  if (!destination) {
    const destCell = coordinateToGridCell(grid, requestedDestination);
    destination = {
      cell: destCell,
      coordinate: gridCellToCoordinate(grid, destCell.row, destCell.column),
      distance: 0
    };
  }

  grid.startCell = start.cell;
  grid.destinationCell = destination.cell;
  grid.start = start.coordinate;
  grid.destination = destination.coordinate;

  // ── Progressive path search ───────────────────────────────────────────────
  // Level 1: strict (all hazards/craters/geology RESTRICTED = impassable)
  let path = findLowestCostPath(grid, cells, thermalColors, isCellTraversable);
  let routingMode = 'strict';

  // Level 2: relaxed hazards (hazard/geology RESTRICTED → high cost, craters still blocked)
  if (!path) {
    path = findLowestCostPath(grid, cells, thermalColors, isCellTraversableRelaxed);
    routingMode = 'relaxed_hazards';
  }

  // Level 3: fully permissive (even craters become high-cost, only UNKNOWN blocked)
  if (!path) {
    path = findLowestCostPath(grid, cells, thermalColors, isCellTraversablePermissive);
    routingMode = 'permissive';
  }

  // Level 4: direct great-circle chain (no grid avoidance — absolute last resort)
  if (!path) {
    path = buildDirectChain(grid);
    routingMode = 'direct_chain';
  }
  const gridCoordinates = path.map(({ row, column }) =>
    gridCellToCoordinate(grid, row, column)
  );
  const coordinates = [
    grid.start,
    ...gridCoordinates,
    grid.destination
  ].filter((coordinate, index, list) =>
    index === 0 ||
    surfaceDistanceMeters(list[index - 1], coordinate) >= 1
  );

  const routeDistanceMeters = coordinates.slice(1).reduce(
    (distance, coordinate, index) =>
      distance +
      surfaceDistanceMeters(coordinates[index], coordinate),
    0
  );
  let accumulatedTerrainCost = 0;
  let accumulatedThermalTransitionScore = 0;
  let elevationGainMeters = 0;
  let elevationLossMeters = 0;
  const traversedCellIndices = [];
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const segmentCost = segmentTraversalCost(
      grid,
      cells,
      previous,
      current,
      thermalColors
    );
    accumulatedThermalTransitionScore +=
      segmentCost.thermalTransitionScore;
    accumulatedTerrainCost += segmentCost.cost;
    if (traversedCellIndices.length === 0) {
      traversedCellIndices.push(segmentCost.cellIndices[0]);
    }
    traversedCellIndices.push(...segmentCost.cellIndices.slice(1));
    for (let cellIndex = 1; cellIndex < segmentCost.cellIndices.length; cellIndex += 1) {
      const previousIndex = segmentCost.cellIndices[cellIndex - 1];
      const currentIndex = segmentCost.cellIndices[cellIndex];
      const elevationChange =
        grid.elevations[currentIndex] - grid.elevations[previousIndex];
      if (elevationChange > 0) elevationGainMeters += elevationChange;
      else elevationLossMeters -= elevationChange;
    }
  }
  if (traversedCellIndices.length === 0 && path.length > 0) {
    traversedCellIndices.push(path[0].row * grid.columns + path[0].column);
  }
  const routeCells = traversedCellIndices.map((index) => cells[index]);
  const startCell = path.length > 0
    ? cells[path[0].row * grid.columns + path[0].column]
    : { costScore: 1 };
  const destinationCell = path.length > 0
    ? cells[path.at(-1).row * grid.columns + path.at(-1).column]
    : { costScore: 1 };
  if (gridCoordinates.length > 0) {
    accumulatedTerrainCost +=
      surfaceDistanceMeters(grid.start, gridCoordinates[0]) *
        startCell.costScore +
      surfaceDistanceMeters(gridCoordinates.at(-1), grid.destination) *
        destinationCell.costScore;
  }

  const knownRouteCells = routeCells.filter(
    (cell) => cell.state !== TERRAIN_STATES.UNKNOWN
  );
  const slopeValues = knownRouteCells.map((cell) => cell.slopeDegrees);
  const classCounts = Object.values(TERRAIN_STATES).reduce((counts, state) => {
    counts[state] = routeCells.filter((cell) => cell.state === state).length;
    return counts;
  }, {});
  const geologyZoneCounts = {};
  routeCells.forEach((cell) => {
    cell.geologyCategories.forEach((category) => {
      geologyZoneCounts[category] = (geologyZoneCounts[category] || 0) + 1;
    });
  });
  const geologyZonesConsidered = geologyZones.reduce((counts, zone) => {
    counts[zone.category] = (counts[zone.category] || 0) + 1;
    return counts;
  }, {});
  const thermalSampleCount = Array.isArray(thermalColors)
    ? thermalColors.filter(Array.isArray).length
    : 0;
  const restrictedCellsAvoided = cells.filter(
    (cell) => cell.state === TERRAIN_STATES.RESTRICTED
  ).length;
  const blockedUnknownCells = cells.filter(
    (cell) => cell.state === TERRAIN_STATES.UNKNOWN
  ).length;
  const craterCellsAvoided = cells.filter(
    (cell) => cell.blockedByCrater
  ).length;
  const totalCells = grid.rows * grid.columns;
  const craterDepthThresholdMeters = getCraterDepthThresholdMeters(grid);

  return {
    status: routingMode === 'strict' ? 'ROUTE_FOUND' : routingMode === 'relaxed_hazards' ? 'ROUTE_FOUND_RELAXED_HAZARDS' : routingMode === 'permissive' ? 'ROUTE_FOUND_PERMISSIVE' : 'FALLBACK_DIRECT_CHAIN',
    routingMode,
    start: grid.start,
    destination: grid.destination,
    requestedStart,
    requestedDestination,
    endpointSearchRequired: {
      start: startNeedsExpandedSearch,
      destination: destinationNeedsExpandedSearch
    },
    endpointAdjustments: {
      startMeters: start.distance,
      destinationMeters: destination.distance
    },
    endpointWarnings,
    routeCoordinates: coordinates,
    routeCells: traversedCellIndices.map((index) => {
      const row = Math.floor(index / grid.columns);
      const column = index % grid.columns;
      return {
        ...gridCellToCoordinate(grid, row, column),
        elevationMeters: getElevation(grid, row, column),
        ...cells[index]
      };
    }),
    totalDistanceMeters: routeDistanceMeters,
    totalDistanceKilometers: routeDistanceMeters / 1000,
    accumulatedTerrainCostMeters: accumulatedTerrainCost,
    estimatedEffort: {
      index: routeDistanceMeters > 0
        ? accumulatedTerrainCost / routeDistanceMeters
        : 1,
      costEquivalentKilometers: accumulatedTerrainCost / 1000,
      elevationGainMeters,
      elevationLossMeters
    },
    averageSlopeDegrees:
      slopeValues.reduce((sum, slope) => sum + slope, 0) /
      Math.max(slopeValues.length, 1),
    maximumSlopeDegrees: slopeValues.length
      ? Math.max(...slopeValues)
      : null,
    terrainClassCounts: classCounts,
    craterAvoidance: {
      blockedCells: craterCellsAvoided,
      minimumDetectableDiameterMeters:
        CONFIG.craterDetection.annulusRadiiCells[0] *
        2 *
        grid.resolutionMeters,
      minimumDepthMeters: craterDepthThresholdMeters
    },
    geologyZoneCounts,
    geologyZonesConsidered,
    thermalInertia: {
      sampledCells: thermalSampleCount,
      transitionScore: accumulatedThermalTransitionScore
    },
    restrictedCellsAvoided: restrictedCellsAvoided,
    unknownCellsBlocked: blockedUnknownCells,
    terrainCoveragePercent: (100 * (totalCells - blockedUnknownCells)) / totalCells,
    confidence: {
      level: 'LOW',
      score: 0.25,
      reason:
        (routingMode === 'direct_chain'
          ? 'FALLBACK: No grid-based safe path was possible — route is a direct great-circle chain with no terrain avoidance. '
          : routingMode === 'permissive'
          ? 'WARNING: Route passes through crater-blocked or restricted terrain because no fully safe path exists. Inspect every segment carefully. '
          : routingMode === 'relaxed_hazards'
          ? 'CAUTION: Route passes through hazard or geology restricted zones because no fully clear path exists. Use maximum caution. '
          : ''
        ) +
        `Crater avoidance blocks sampled cells that appear to lie inside closed MOLA depressions at least about ${CONFIG.craterDetection.annulusRadiiCells[0] * 2 * grid.resolutionMeters} m wide and ${craterDepthThresholdMeters.toFixed(0)} m deep. This cannot guarantee a crater-free route: smaller, shallow, partly sampled, or otherwise unresolved craters may be missed. MOLA cannot detect foot-scale hazards. The TES layer is sampled as a coarse color-transition cue, not calibrated numeric thermal inertia. USGS global geology is regional-scale and does not confirm surface materials or ice. Terrain-relief thresholds are scaled by ${Math.max(1, grid.resolutionMeters / CONFIG.grid.defaultResolutionMeters).toFixed(1)}x for this grid spacing; fine terrain between coarse samples is not assessed. This experimental route is not astronaut-certified.`,
      sourceResolutionMeters: metadata.sourceResolutionMeters ?? null,
      planningResolutionMeters: grid.resolutionMeters,
      nominalHorizontalUncertaintyMeters:
        grid.resolutionMeters / 2 +
        (metadata.sourceResolutionMeters ?? 0) / 2
    },
    terrainThresholdScaleFactor: Math.max(
      1,
      grid.resolutionMeters / CONFIG.grid.defaultResolutionMeters
    ),
    grid: {
      rows: grid.rows,
      columns: grid.columns,
      resolutionMeters: grid.resolutionMeters,
      coordinateSystem: metadata.coordinateSystem || 'Mars geographic degrees (WKID 104905)',
      elevationUnits: metadata.elevationUnits || 'meters'
    },
    heuristic: 'Half Mars surface distance; movement cost is bounded below by 0.5 times distance.',
    dataSource: metadata.dataSource || 'NASA Mars Trek MOLA/HRSC DEM'
  };
}

module.exports = {
  TERRAIN_STATES,
  analyzeTerrain,
  applyGeologyZones,
  calculateRoute,
  coordinateToGridCell,
  createLocalGridGeometry,
  findLowestCostPath,
  gridCellToCoordinate,
  isValidCoordinate,
  rasterCoordinateToCell
};
