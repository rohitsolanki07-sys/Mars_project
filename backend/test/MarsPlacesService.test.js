const assert = require('node:assert/strict');
const test = require('node:test');

const { getMarsPlaces, isValidBounds } = require('../Services/MarsPlacesService');

test('accepts valid map bounds and rejects invalid bounds', () => {
  assert.equal(isValidBounds([75, 16, 80, 21]), true);
  assert.equal(isValidBounds([-181, 16, 80, 21]), false);
  assert.equal(isValidBounds([80, 21, 75, 16]), false);
  assert.equal(isValidBounds([75, 16, Infinity, 21]), false);
});

test('converts NASA Mars Trek feature records into map places', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.includes('outreach_nomenclature')) {
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              attributes: {
                clean_name: 'Jezero',
                diameter: 47.5212,
                category: 'crater',
                type: 'Crater, craters',
                desc_: 'Landing site&apos;s crater',
                link: 'http://planetarynames.wr.usgs.gov/Feature/14300'
              },
              geometry: { x: 77.6873, y: 18.4082 }
            }
          ]
        })
      };
    }

    return { ok: true, json: async () => ({ features: [] }) };
  };

  try {
    const result = await getMarsPlaces([75, 16, 80, 21]);

    assert.equal(result.places.length, 1);
    assert.equal(result.places[0].name, 'Jezero');
    assert.equal(result.places[0].latitude, 18.4082);
    assert.equal(result.places[0].longitude, 77.6873);
    assert.equal(result.places[0].sizeKm, 47.5212);
    assert.equal(result.places[0].description, "Landing site's crater");
    assert.equal(
      result.places[0].sourceUrl,
      'https://planetarynames.wr.usgs.gov/Feature/14300'
    );
    assert.deepEqual(result.warnings, []);
  } finally {
    global.fetch = originalFetch;
  }
});
