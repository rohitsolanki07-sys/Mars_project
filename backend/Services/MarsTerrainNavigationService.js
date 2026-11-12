const CONFIG = require('./TerrainNavigationConfig');
const {
  calculateRoute,
  isValidCoordinate
} = require('./MarsTerrainAnalysis');
const marsTerrainDataService = require('./MarsTerrainDataService');

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
  const terrain = await marsTerrainDataService.loadMarsMolaGrid(
    request.start,
    request.destination,
    options
  );
  let route;
  try {
    route = calculateRoute(terrain.grid, hazards, terrain.metadata);
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

  const expandedTerrain = await marsTerrainDataService.loadMarsMolaGrid(
    request.start,
    request.destination,
    {
      ...options,
      endpointSearchRangeMeters: CONFIG.endpoints.maximumSnapDistanceMeters
    }
  );
  return calculateRoute(expandedTerrain.grid, hazards, expandedTerrain.metadata);
}

module.exports = { calculateTerrainAwareRoute };
