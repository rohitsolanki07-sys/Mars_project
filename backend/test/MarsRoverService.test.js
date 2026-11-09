const assert = require('node:assert/strict');
const test = require('node:test');

const { getCuriosityLayers } = require('../Services/MarsRoverService');

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
