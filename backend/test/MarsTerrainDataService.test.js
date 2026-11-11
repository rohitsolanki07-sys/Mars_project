const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getMarsMolaMetadata,
  loadMarsMolaGrid
} = require('../Services/MarsTerrainDataService');

test('loads NASA raster metadata and keeps missing MOLA samples unknown', async () => {
  const originalFetch = global.fetch;
  let sampleCount = 0;
  global.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/ImageServer')) {
      return {
        ok: true,
        json: async () => ({
          name: 'Mars MOLA/HRSC blended DEM',
          pixelSizeX: 0.00337412,
          pixelSizeY: 0.00337412,
          pixelType: 'S16',
          bandCount: 1,
          spatialReference: { wkid: 104905 },
          minValues: [-8528],
          maxValues: [21230]
        })
      };
    }

    assert.equal(url.pathname.endsWith('/getSamples'), true);
    const geometry = JSON.parse(url.searchParams.get('geometry'));
    sampleCount = geometry.points.length;
    return {
      ok: true,
      json: async () => ({
        samples: geometry.points.slice(2).map((_, index) => ({
          locationId: index + 2,
          value: index === 0 ? -9999 : -4000 + index
        }))
      })
    };
  };

  try {
    const metadata = await getMarsMolaMetadata();
    assert.equal(metadata.spatialReference.wkid, 104905);
    assert.equal(metadata.pixelSizeXDegrees, 0.00337412);

    const result = await loadMarsMolaGrid(
      { latitude: 33.1234, longitude: 11.2345 },
      { latitude: 33.1244, longitude: 11.2345 }
    );
    assert.equal(result.grid.elevations.length, sampleCount);
    assert.ok(result.grid.elevations.includes(null));
    assert.ok(result.metadata.validSampleCount < sampleCount);
    assert.equal(result.metadata.totalSampleCount, sampleCount);
    assert.equal(result.metadata.coordinateSystem, 'Geographic Mars datum WKID 104905');
  } finally {
    global.fetch = originalFetch;
  }
});
