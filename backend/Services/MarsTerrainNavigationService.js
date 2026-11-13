const CONFIG = require('./TerrainNavigationConfig');
const {
  calculateRoute,
  isValidCoordinate
} = require('./MarsTerrainAnalysis');
const marsTerrainDataService = require('./MarsTerrainDataService');
const marsScienceDataService = require('./MarsScienceDataService');
const marsThermalDataService = require('./MarsThermalDataService');

function validateHazards(hazards) {
  if (hazards === undefined) return [];
  if (!Array.isArray(hazards) || hazards.length > 200) {
    throw new TypeError('Hazards must be an array containing no more than 200 areas.');
  }
  return hazards;
}

async function calculateTerrainAwareRoute(request) {
  if (!request || !isValidCoordinate(request.start)) {
    throw new TypeError('A valid start latitude and longitude are required.');
  }
  if (!isValidCoordinate(request.destination)) {
    throw new TypeError('A valid destination latitude and longitude are required.');
  }
  if (
    request.resolutionMeters !== undefined &&
    (!Number.isFinite(request.resolutionMeters) ||
      request.resolutionMeters < CONFIG.grid.minimumResolutionMeters ||
      request.resolutionMeters > CONFIG.grid.maximumResolutionMeters)
  ) {
    throw new RangeError(
      `Resolution must be between ${CONFIG.grid.minimumResolutionMeters} and ${CONFIG.grid.maximumResolutionMeters} metres.`
    );
  }

  const hazards = validateHazards(request.hazards);
  const options = {
    resolutionMeters: request.resolutionMeters,
    interpolation: request.interpolation
  };
  const loadRouteData = async (gridOptions) => {
    const terrain = await marsTerrainDataService.loadMarsMolaGrid(
      request.start,
      request.destination,
      gridOptions
    );
    const [geologyZones, thermalInertiaColors] = await Promise.all([
      marsScienceDataService.loadGeologyZones(terrain.grid),
      marsThermalDataService.loadThermalInertiaColors(terrain.grid)
    ]);
    return {
      terrain,
      environment: { geologyZones, thermalInertiaColors }
    };
  };
  const routeData = await loadRouteData(options);
  const { terrain, environment } = routeData;
  let route;
  try {
    route = calculateRoute(
      terrain.grid,
      hazards,
      terrain.metadata,
      environment
    );
  } catch (error) {
    if (
      !error.message.startsWith('No traversable terrain was found within') &&
      !error.message.startsWith('No safe route exists')
    ) {
      throw error;
    }
  }

  if (
    route &&
    !route.endpointSearchRequired.start &&
    !route.endpointSearchRequired.destination
  ) {
    return route;
  }

  const expandedRouteData = await loadRouteData({
    ...options,
    endpointSearchRangeMeters: CONFIG.endpoints.maximumSnapDistanceMeters
  });
  return calculateRoute(
    expandedRouteData.terrain.grid,
    hazards,
    expandedRouteData.terrain.metadata,
    expandedRouteData.environment
  );
}

module.exports = { calculateTerrainAwareRoute };
