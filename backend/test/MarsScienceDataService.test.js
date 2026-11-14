const assert = require('node:assert/strict');
const test = require('node:test');

const { createLocalGridGeometry } = require('../Services/MarsTerrainAnalysis');
const {
  classifyGeologyUnit,
  loadGeologyZones,
  loadVisitableSites
} = require('../Services/MarsScienceDataService');

test('classifies USGS global geology into route-cost categories', () => {
  assert.equal(classifyGeologyUnit('Amazonian apron unit').category, 'water_ice_target');
  assert.equal(classifyGeologyUnit('Amazonian outflow channel unit').category, 'water_ice_target');
  assert.equal(classifyGeologyUnit('Late Hesperian lowland unit').category, 'preferred_transit');
  assert.equal(classifyGeologyUnit('Early Amazonian basin unit').category, 'preferred_transit');
  assert.equal(classifyGeologyUnit('Late Amazonian polar dunes unit').category, 'hazard');
  assert.equal(
    classifyGeologyUnit('Noachian highland massif unit').category,
    'crater_ejecta_highland'
  );
  assert.equal(
    classifyGeologyUnit('Noachian crater ejecta unit').category,
    'crater_ejecta_highland'
  );
  assert.equal(classifyGeologyUnit('Noachian volcanic edifice unit').category, 'hazard');
  assert.equal(
    classifyGeologyUnit('Amazonian volcanic unit').category,
    'volcanic_habitat_candidate'
  );
  assert.equal(
    classifyGeologyUnit('Noachian highland unit').category,
    'crater_ejecta_highland'
  );
});

test('loads mapped geology polygons as costed route zones', async () => {
  const originalFetch = global.fetch;
  const grid = createLocalGridGeometry(
    { latitude: 0, longitude: 0 },
    { latitude: 0.01, longitude: 0.01 }
  );
  global.fetch = async (url) => {
    assert.match(String(url), /SIM3292_Global_Geology\/MapServer\/0\/query/);
    assert.match(String(url), /UnitDesc/);
    return {
      ok: true,
      json: async () => ({
        features: [{
          attributes: {
            OBJECTID: 42,
            UnitDesc: 'Late Amazonian apron unit'
          },
          geometry: {
            rings: [[
              [-0.01, -0.01],
              [0.02, -0.01],
              [0.02, 0.02],
              [-0.01, 0.02],
              [-0.01, -0.01]
            ]]
          }
        }]
      })
    };
  };

  try {
    const zones = await loadGeologyZones(grid);
    assert.equal(zones.length, 1);
    assert.equal(zones[0].category, 'water_ice_target');
    assert.equal(zones[0].polygon.length, 5);
  } finally {
    global.fetch = originalFetch;
  }
});

test('maps NASA mineral detections and exploration-zone records as selectable sites', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes('/EZ/MapServer/0/')
      ? {
          features: [{
            attributes: {
              FID: 17,
              name: 'Candidate Exploration Zone',
              type: 'Exploration Zone',
              status: 'Proposed',
              lat: 18.5,
              lon: 77.4
            },
            geometry: { x: 77.4, y: 18.5 }
          }]
        }
      : {
          features: [{
            attributes: {
              FID: 23,
              Type: 'Phyllosilicate',
              Instrument: 'CRISM',
              Latitude: 18.6,
              Longitude: 77.3
            },
            geometry: { x: 77.3, y: 18.6 }
          }]
        }
  });

  try {
    const sites = await loadVisitableSites({
      west: 77,
      south: 18,
      east: 78,
      north: 19
    });
    assert.equal(sites.sampleSites.length, 1);
    assert.equal(sites.sampleSites[0].type, 'Phyllosilicate');
    assert.equal(sites.sampleSites[0].instrument, 'CRISM');
    assert.equal(sites.explorationSites.length, 1);
    assert.equal(sites.explorationSites[0].name, 'Candidate Exploration Zone');
  } finally {
    global.fetch = originalFetch;
  }
});
