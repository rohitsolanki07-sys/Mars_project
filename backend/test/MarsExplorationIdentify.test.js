const assert = require('node:assert/strict');
const test = require('node:test');

const {
  identifyExplorationFeatures
} = require('../Services/MarsScienceDataService');

test('identifies NASA exploration points and planning zones at map coordinates', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url) => {
    const requestUrl = new URL(String(url));
    requests.push(requestUrl);
    if (requestUrl.pathname.endsWith('/EZ/MapServer/0/query')) {
      return {
        ok: true,
        json: async () => ({
          features: [{
            attributes: {
              FID: 17,
              name: 'Gale Crater',
              type: 'Exploration Zone',
              status: 'Proposed',
              lat: -4.5965,
              lon: 137.4019
            }
          }]
        })
      };
    }
    if (requestUrl.pathname.endsWith('/EZMars/MapServer/3/query')) {
      return {
        ok: true,
        json: async () => ({
          features: [{
            attributes: {
              FID: 301,
              name: '1040.02',
              confidence: 2,
              ez_name: 'Gale Crater',
              latitude: ' ',
              longitude: ' '
            }
          }]
        })
      };
    }
    if (requestUrl.pathname.endsWith('/EZMars/MapServer/4/query')) {
      return {
        ok: true,
        json: async () => ({
          features: [{
            attributes: {
              FID: 15,
              name: 'Gale Crater',
              lat: -4.5,
              lon: 137.5,
              elev: -4.519,
              abstract_l: 'https://www.hou.usra.edu/meetings/explorationzone2015/pdf/1020.pdf',
              presentati: 'https://www.nasa.gov/example.pdf',
              video_link: 'https://www.youtube.com/watch?v=example'
            }
          }]
        })
      };
    }
    return { ok: true, json: async () => ({ features: [] }) };
  };

  try {
    const features = await identifyExplorationFeatures(-4.5965, 137.4019);
    assert.equal(requests.length, 6);
    assert.equal(features.length, 3);
    assert.equal(features[0].name, 'Gale Crater');
    assert.ok(features[0].details.some(([, value]) => value === 'Proposed'));
    assert.equal(features[1].name, '1040.02');
    assert.ok(!features[1].details.some(([label]) => label === 'Coordinates'));
    assert.equal(features[2].links.length, 3);

    const pointQuery = requests.find((url) => url.pathname.endsWith('/EZ/MapServer/0/query'));
    assert.equal(pointQuery.searchParams.get('geometry'), '137.4019,-4.5965');
    assert.equal(pointQuery.searchParams.get('distance'), '10000');
    const polygonQuery = requests.find((url) => url.pathname.endsWith('/EZMars/MapServer/3/query'));
    assert.equal(polygonQuery.searchParams.has('distance'), false);

    await assert.rejects(
      identifyExplorationFeatures(100, 0),
      /valid exploration click latitude and longitude/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
