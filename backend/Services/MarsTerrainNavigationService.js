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
  // Attempt the route at the requested resolution.
  // calculateRoute now always returns a route (using progressive fallback),
  // so this should never throw a "no route" error. We still re-throw
  // unexpected errors (data, type, range errors from bad inputs).
  let route = calculateRoute(
    terrain.grid,
    hazards,
    terrain.metadata,
    environment
  );

  // If both endpoints landed on traversable cells AND the route is strict
  // (not a fallback), we're done — no retry needed.
  if (
    !route.endpointSearchRequired.start &&
    !route.endpointSearchRequired.destination &&
    route.routingMode === 'strict'
  ) {
    return route;
  }

  // One or both endpoints needed snapping. Re-run with an expanded grid that
  // guarantees endpoint search coverage, then return whichever result is better
  // (shorter or higher-confidence routing mode).
  try {
    const expandedRouteData = await loadRouteData({
      ...options,
      endpointSearchRangeMeters: CONFIG.endpoints.maximumSnapDistanceMeters
    });
    const expandedRoute = calculateRoute(
      expandedRouteData.terrain.grid,
      hazards,
      expandedRouteData.terrain.metadata,
      expandedRouteData.environment
    );
    // Prefer the expanded route unless the original had a stricter routing mode.
    const modeRank = { strict: 0, relaxed_hazards: 1, permissive: 2, direct_chain: 3 };
    const originalRank = modeRank[route.routingMode] ?? 3;
    const expandedRank = modeRank[expandedRoute.routingMode] ?? 3;
    return expandedRank <= originalRank ? expandedRoute : route;
  } catch (_) {
    // If the expanded attempt fails for any unexpected reason, return the
    // original route — something is always better than nothing.
    return route;
  }
}

module.exports = { calculateTerrainAwareRoute };
