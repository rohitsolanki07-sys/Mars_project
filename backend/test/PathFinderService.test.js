const assert = require('node:assert/strict');
const test = require('node:test');

const missionData = require('../Data/marsData.json');
const pathFinderService = require('../Services/PathFinderService');

// Check that a known site's route produces a usable plan and consistent
// distance and oxygen figures.
test('calculates route distance and suit telemetry for Jezero Crater', () => {
  const result = pathFinderService.calculateSafeEVA(missionData.jezero_crater);

  assert.equal(result.mission_status, 'GO_FOR_EVA');
  assert.equal(
    result.route_geometry.coordinates.length,
    missionData.jezero_crater.safe_route.length
  );
  assert.ok(result.metrics.total_distance_km > 0);
  assert.equal(
    result.suit_consumables_forecast.o2_remaining_pct,
    100 - result.suit_consumables_forecast.o2_consumption_projected_pct
  );
});
