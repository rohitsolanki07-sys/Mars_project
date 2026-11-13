const { inflateSync } = require('node:zlib');
const { gridCellToCoordinate } = require('./MarsTerrainAnalysis');

const TILE_ZOOM = 1;
const TILES_PER_AXIS = 2 ** (TILE_ZOOM + 1);
const TILE_ROWS = 2 ** TILE_ZOOM;
const TILE_URL =
  'https://trek.nasa.gov/tiles/Mars/EQ/TES_Thermal_Inertia/1.0.0/default/default028mm';
const tileCache = new Map();

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(bytes) {
  const buffer = Buffer.from(bytes);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error('NASA TES thermal tile is not a valid PNG image.');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const imageChunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      imageChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (
    width === 0 ||
    height === 0 ||
    bitDepth !== 8 ||
    ![2, 6].includes(colorType) ||
    interlace !== 0
  ) {
    throw new Error('NASA TES thermal tile uses an unsupported PNG encoding.');
  }

  const channels = colorType === 6 ? 4 : 3;
  const bytesPerRow = width * channels;
  const compressed = Buffer.concat(imageChunks);
  const decoded = inflateSync(compressed);
  if (decoded.length !== height * (bytesPerRow + 1)) {
    throw new Error('NASA TES thermal tile has incomplete pixel data.');
  }

  const pixels = Buffer.alloc(height * bytesPerRow);
  for (let row = 0; row < height; row += 1) {
    const sourceOffset = row * (bytesPerRow + 1);
    const filter = decoded[sourceOffset];
    const targetOffset = row * bytesPerRow;
    for (let column = 0; column < bytesPerRow; column += 1) {
      const raw = decoded[sourceOffset + column + 1];
      const left = column >= channels ? pixels[targetOffset + column - channels] : 0;
      const above = row > 0 ? pixels[targetOffset + column - bytesPerRow] : 0;
      const upperLeft =
        row > 0 && column >= channels
          ? pixels[targetOffset + column - bytesPerRow - channels]
          : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paethPredictor(left, above, upperLeft);
      else if (filter !== 0) {
        throw new Error(`NASA TES thermal tile uses unsupported PNG filter ${filter}.`);
      }
      pixels[targetOffset + column] = (raw + predictor) & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

async function loadTile(column, row) {
  const key = `${column}/${row}`;
  if (!tileCache.has(key)) {
    const request = fetch(`${TILE_URL}/${TILE_ZOOM}/${row}/${column}.png`, {
      signal: AbortSignal.timeout(30000)
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`NASA TES thermal tile returned HTTP ${response.status}.`);
      }
      return decodePng(await response.arrayBuffer());
    }).catch((error) => {
      tileCache.delete(key);
      throw error;
    });
    tileCache.set(key, request);
    if (tileCache.size > 16) tileCache.delete(tileCache.keys().next().value);
  }
  return tileCache.get(key);
}

function getTilePixel(latitude, longitude) {
  const boundedLatitude = Math.max(-90, Math.min(90 - Number.EPSILON, latitude));
  const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360;
  const column = Math.min(
    TILES_PER_AXIS - 1,
    Math.floor(wrappedLongitude / 360 * TILES_PER_AXIS)
  );
  const row = Math.min(
    TILE_ROWS - 1,
    Math.max(0, Math.floor((90 - boundedLatitude) / 180 * TILE_ROWS))
  );
  const tileWidthDegrees = 360 / TILES_PER_AXIS;
  const tileHeightDegrees = 180 / TILE_ROWS;
  const tileWest = -180 + column * tileWidthDegrees;
  const tileNorth = 90 - row * tileHeightDegrees;
  const pixelX = Math.min(
    255,
    Math.max(0, Math.floor((longitude - tileWest) / tileWidthDegrees * 256))
  );
  const pixelY = Math.min(
    255,
    Math.max(0, Math.floor((tileNorth - latitude) / tileHeightDegrees * 256))
  );
  return { column, row, pixelX, pixelY };
}

async function loadThermalInertiaColors(grid) {
  const positions = [];
  const tileRequests = new Map();
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const coordinate = gridCellToCoordinate(grid, row, column);
      const pixel = getTilePixel(coordinate.latitude, coordinate.longitude);
      const key = `${pixel.column}/${pixel.row}`;
      positions.push({ pixel, key });
      if (!tileRequests.has(key)) {
        tileRequests.set(key, loadTile(pixel.column, pixel.row));
      }
    }
  }
  const tiles = new Map(
    await Promise.all(
      Array.from(tileRequests, async ([key, request]) => [key, await request])
    )
  );
  return positions.map(({ pixel, key }) => {
    const tile = tiles.get(key);
    const index = (pixel.pixelY * tile.width + pixel.pixelX) * tile.channels;
    if (tile.channels === 4 && tile.pixels[index + 3] < 128) return null;
    return [
      tile.pixels[index],
      tile.pixels[index + 1],
      tile.pixels[index + 2]
    ];
  });
}

module.exports = {
  decodePng,
  getTilePixel,
  loadThermalInertiaColors
};
