const assert = require('node:assert/strict');
const test = require('node:test');
const { deflateSync } = require('node:zlib');

const {
  decodePng,
  getTilePixel
} = require('../Services/MarsThermalDataService');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function makeOnePixelPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 10, 20, 30, 255]))),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

test('decodes an RGBA TES tile pixel', () => {
  const image = decodePng(makeOnePixelPng());
  assert.equal(image.width, 1);
  assert.equal(image.height, 1);
  assert.deepEqual(Array.from(image.pixels), [10, 20, 30, 255]);
});

test('maps Mars coordinates to the two-row level-one TES tile matrix', () => {
  assert.deepEqual(getTilePixel(0, 0), {
    column: 2,
    row: 1,
    pixelX: 0,
    pixelY: 0
  });
  assert.deepEqual(getTilePixel(80, -170), {
    column: 0,
    row: 0,
    pixelX: 28,
    pixelY: 28
  });
});
