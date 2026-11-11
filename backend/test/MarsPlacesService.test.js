const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getMarsElevations,
  getMarsPlaces,
  isValidBounds
} = require('../Services/MarsPlacesService');

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
    if (url.pathname.endsWith('/getSamples')) {
      const requestGeometry = JSON.parse(url.searchParams.get('geometry'));
      return {
        ok: true,
        json: async () => ({
          samples: requestGeometry.points.map((point, locationId) => ({
            locationId,
            value: '-2663'
          }))
        })
      };
    }

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
    assert.equal(result.places[0].elevationM, -2663);
    assert.deepEqual(result.warnings, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('samples NASA MOLA elevations for multiple coordinates in the correct order', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = new URL(input);
    const geometry = JSON.parse(url.searchParams.get('geometry'));
    assert.equal(url.pathname.endsWith('/getSamples'), true);
    assert.equal(url.searchParams.get('geometryType'), 'esriGeometryMultipoint');
    assert.deepEqual(geometry.points, [[77.5, 18.4], [138, -5]]);

    return {
      ok: true,
      json: async () => ({
        samples: [
          { locationId: 0, value: '-2500' },
          { locationId: 1, value: '1200' }
        ]
      })
    };
  };

  try {
    const elevations = await getMarsElevations([
      { latitude: 18.4, longitude: 77.5 },
      { latitude: -5, longitude: 138 }
    ]);
    assert.deepEqual(elevations, [-2500, 1200]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('caches samples by interpolation method and preserves NoData as null', async () => {
  const originalFetch = global.fetch;
  const interpolations = [];
  global.fetch = async (input) => {
    const url = new URL(input);
    interpolations.push(url.searchParams.get('interpolation'));
    return {
      ok: true,
      json: async () => ({
        samples: [{ locationId: 0, value: interpolations.length === 1 ? 12 : null }]
      })
    };
  };

  try {
    const point = { latitude: 42.1234567, longitude: 11.1234567 };
    const nearest = await getMarsElevations([point]);
    const bilinear = await getMarsElevations([point], {
      interpolation: 'RSP_Bilinear'
    });

    assert.deepEqual(nearest, [12]);
    assert.deepEqual(bilinear, [null]);
    assert.deepEqual(interpolations, [
      'RSP_NearestNeighbor',
      'RSP_Bilinear'
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});
