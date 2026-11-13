const assert = require('node:assert/strict');
const test = require('node:test');

const CONFIG = require('../Services/TerrainNavigationConfig');
const { createLocalGridGeometry } = require('../Services/MarsTerrainAnalysis');
const terrainDataService = require('../Services/MarsTerrainDataService');
const scienceDataService = require('../Services/MarsScienceDataService');
const thermalDataService = require('../Services/MarsThermalDataService');
const { calculateTerrainAwareRoute } = require('../Services/MarsTerrainNavigationService');

function makeTerrain(start, destination, paddingMeters, withUnknownBarrier) {
  const grid = createLocalGridGeometry(start, destination, {
    resolutionMeters: CONFIG.grid.defaultResolutionMeters,
    endpointSearchRangeMeters: paddingMeters
  });
  grid.elevations = new Array(grid.rows * grid.columns).fill(0);

  if (withUnknownBarrier) {
    const barrierColumn = Math.floor(grid.columns / 2);
    for (let row = 0; row < grid.rows; row += 1) {
      grid.elevations[row * grid.columns + barrierColumn] = null;
    }
  }

  return { grid, metadata: { sourceResolutionMeters: 200 } };
}

test('retries a disconnected route with a bounded wider MOLA grid', async () => {
  const originalLoadMarsMolaGrid = terrainDataService.loadMarsMolaGrid;
  const originalLoadGeologyZones = scienceDataService.loadGeologyZones;
  const originalLoadThermalColors = thermalDataService.loadThermalInertiaColors;
  const start = { latitude: 0, longitude: 0 };
  const destination = { latitude: 0, longitude: 0.02 };
  const requestedPadding = [];
  terrainDataService.loadMarsMolaGrid = async (
    requestedStart,
    requestedDestination,
    options
  ) => {
    const paddingMeters = options.endpointSearchRangeMeters || 0;
    requestedPadding.push(paddingMeters);
    return makeTerrain(
      requestedStart,
      requestedDestination,
      paddingMeters,
      requestedPadding.length === 1
    );
  };
  scienceDataService.loadGeologyZones = async () => [];
  thermalDataService.loadThermalInertiaColors = async (grid) =>
    new Array(grid.rows * grid.columns).fill([0, 0, 0]);

  try {
    const route = await calculateTerrainAwareRoute({
      start,
      destination,
      resolutionMeters: CONFIG.grid.defaultResolutionMeters
    });

    assert.equal(route.status, 'ROUTE_FOUND');
    assert.ok(route.routeCoordinates.length > 1);
    assert.deepEqual(requestedPadding, [
      0,
      CONFIG.endpoints.maximumSnapDistanceMeters
    ]);
  } finally {
    terrainDataService.loadMarsMolaGrid = originalLoadMarsMolaGrid;
    scienceDataService.loadGeologyZones = originalLoadGeologyZones;
    thermalDataService.loadThermalInertiaColors = originalLoadThermalColors;
  }
});
