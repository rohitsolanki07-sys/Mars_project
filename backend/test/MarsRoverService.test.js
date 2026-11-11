const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getCuriosityLayers,
  getPerseveranceLayers
} = require('../Services/MarsRoverService');

test('converts NASA Mars Trek Curiosity traverse and waypoint layers', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.includes('curiosity_path')) {
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              geometry: {
                type: 'LineString',
                coordinates: [
                  [137.4, -4.5],
                  [137.41, -4.51]
                ]
              }
            }
          ]
        })
      };
    }

    return {
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { type: 'Point', coordinates: [137.4, -4.5] },
            properties: {
              name: 'Bradbury Landing',
              template: 'jpl/assets/features/curiosity/bradbury.html'
            }
          },
          {
            geometry: { type: 'Point', coordinates: [999, 0] },
            properties: { name: 'Invalid site' }
          }
        ]
      })
    };
  };

  try {
    const result = await getCuriosityLayers();
    assert.deepEqual(result.traverse, [[[137.4, -4.5], [137.41, -4.51]]]);
    assert.deepEqual(result.waypoints, [
      {
        name: 'Bradbury Landing',
        longitude: 137.4,
        latitude: -4.5,
        sourceUrl: 'https://trek.nasa.gov/mars/jpl/assets/features/curiosity/bradbury.html'
      }
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('limits NASA rover traverse paths while preserving both endpoints', async () => {
  const originalFetch = global.fetch;
  const coordinates = Array.from({ length: 4000 }, (_, index) => [
    130 + index / 10000,
    -4 - index / 10000
  ]);
  global.fetch = async (input) => {
    const url = new URL(input);
    return {
      ok: true,
      json: async () => ({
        features: url.pathname.includes('curiosity_path')
          ? [{ geometry: { type: 'LineString', coordinates } }]
          : [
              {
                geometry: { type: 'Point', coordinates: [137, -4] },
                properties: { name: 'Rover stop' }
              }
            ]
      })
    };
  };

  try {
    const result = await getCuriosityLayers();
    assert.equal(result.traverse[0].length, 1800);
    assert.deepEqual(result.traverse[0][0], coordinates[0]);
    assert.deepEqual(result.traverse[0].at(-1), coordinates.at(-1));
  } finally {
    global.fetch = originalFetch;
  }
});

test('converts NASA Mars Trek Perseverance path, stops, and landing ellipse', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.includes('Perseverance_Traverse_Path')) {
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              geometry: {
                type: 'LineString',
                coordinates: [
                  [77.45, 18.44, 0, null],
                  [77.46, 18.45, 0, null]
                ]
              }
            }
          ]
        })
      };
    }
    if (url.pathname.includes('perseverance_landing_ellipse')) {
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [77.4, 18.4, 0],
                  [77.5, 18.4, 0],
                  [77.5, 18.5, 0],
                  [77.4, 18.5, 0],
                  [77.4, 18.4, 0]
                ]]
              }
            }
          ]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { type: 'Point', coordinates: [77.456, 18.446, 0, null] },
            properties: {
              name: 'Perseverance Landing Ellipse',
              template: '/assets/bookmarks/mars/perseverance/perseverance-landing-ellipse/perseverance_landing_ellipse.html'
            }
          },
          {
            geometry: { type: 'Point', coordinates: [999, 0] },
            properties: { name: 'Invalid site' }
          }
        ]
      })
    };
  };

  try {
    const result = await getPerseveranceLayers();
    assert.deepEqual(result.traverse, [[[77.45, 18.44], [77.46, 18.45]]]);
    assert.deepEqual(result.waypoints, [
      {
        name: 'Perseverance Landing Ellipse',
        longitude: 77.456,
        latitude: 18.446,
        sourceUrl: 'https://trek.nasa.gov/assets/bookmarks/mars/perseverance/perseverance-landing-ellipse/perseverance_landing_ellipse.html'
      }
    ]);
    assert.deepEqual(result.landingEllipse, [[
      [77.4, 18.4],
      [77.5, 18.4],
      [77.5, 18.5],
      [77.4, 18.5],
      [77.4, 18.4]
    ]]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('limits Perseverance traverse paths while preserving both endpoints', async () => {
  const originalFetch = global.fetch;
  const coordinates = Array.from({ length: 4000 }, (_, index) => [
    77 + index / 10000,
    18 + index / 10000,
    0,
    null
  ]);
  global.fetch = async (input) => {
    const url = new URL(input);
    return {
      ok: true,
      json: async () => ({
        features: url.pathname.includes('Perseverance_Traverse_Path')
          ? [{ geometry: { type: 'LineString', coordinates } }]
          : url.pathname.includes('perseverance_landing_ellipse')
            ? [{
                geometry: {
                  type: 'Polygon',
                  coordinates: [[[77, 18], [77.1, 18], [77.1, 18.1], [77, 18]]]
                }
              }]
            : [{
                geometry: { type: 'Point', coordinates: [77, 18] },
                properties: { name: 'Landing site' }
              }]
      })
    };
  };

  try {
    const result = await getPerseveranceLayers();
    assert.equal(result.traverse[0].length, 1800);
    assert.deepEqual(result.traverse[0][0], [77, 18]);
    assert.deepEqual(result.traverse[0].at(-1), [77.3999, 18.3999]);
  } finally {
    global.fetch = originalFetch;
  }
});
