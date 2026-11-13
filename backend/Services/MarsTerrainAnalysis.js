const CONFIG = require('./TerrainNavigationConfig');

const DEG_TO_RAD = Math.PI / 180;
const MAX_GRID_LATITUDE = 89.999;
const TERRAIN_STATES = Object.freeze({
  SAFE: 'SAFE_CANDIDATE',
  CAUTION: 'CAUTION',
  HIGH_RISK: 'HIGH_RISK',
  RESTRICTED: 'RESTRICTED',
  UNKNOWN: 'UNKNOWN'
});

function isValidCoordinate(point) {
  return Boolean(
    point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function normalizeLongitudeDelta(delta) {
  return ((delta + 540) % 360) - 180;
}

function createLocalGridGeometry(start, destination, options = {}) {
  if (!isValidCoordinate(start) || !isValidCoordinate(destination)) {
    throw new TypeError('Start and destination must be valid Mars coordinates.');
  }

  const requestedResolution =
    options.resolutionMeters ?? CONFIG.grid.defaultResolutionMeters;
  if (
    !Number.isFinite(requestedResolution) ||
    requestedResolution < CONFIG.grid.minimumResolutionMeters ||
    requestedResolution > CONFIG.grid.maximumResolutionMeters
  ) {
    throw new RangeError(
      `Grid resolution must be between ${CONFIG.grid.minimumResolutionMeters} and ${CONFIG.grid.maximumResolutionMeters} metres.`
    );
  }
  const endpointSearchRangeMeters =
    options.endpointSearchRangeMeters ?? 0;
  if (
    !Number.isFinite(endpointSearchRangeMeters) ||
    endpointSearchRangeMeters < 0 ||
    endpointSearchRangeMeters > CONFIG.endpoints.maximumSnapDistanceMeters
  ) {
    throw new RangeError(
      `Endpoint search range must be between 0 and ${CONFIG.endpoints.maximumSnapDistanceMeters} metres.`
    );
  }

  const centerLatitude = (start.latitude + destination.latitude) / 2;
  const centerLongitude =
    start.longitude +
    normalizeLongitudeDelta(destination.longitude - start.longitude) / 2;
  const latitudeScale = CONFIG.marsEquatorialRadiusMeters;
  const longitudeScale =
    latitudeScale * Math.max(Math.cos(centerLatitude * DEG_TO_RAD), 0.01);
  const toLocal = (coordinate) => ({
    x:
      normalizeLongitudeDelta(coordinate.longitude - centerLongitude) *
      DEG_TO_RAD *
      longitudeScale,
    y:
      (coordinate.latitude - centerLatitude) *
      DEG_TO_RAD *
      latitudeScale
  });
  const startLocal = toLocal(start);
  const destinationLocal = toLocal(destination);
  const padding = Math.max(
    requestedResolution * CONFIG.grid.paddingCells,
    endpointSearchRangeMeters
  );
  const minX = Math.min(startLocal.x, destinationLocal.x) - padding;
  const maxX = Math.max(startLocal.x, destinationLocal.x) + padding;
  const minY = Math.min(startLocal.y, destinationLocal.y) - padding;
  const maxY = Math.max(startLocal.y, destinationLocal.y) + padding;
  const maxIntervals = CONFIG.grid.maximumDimension - 1;
  const resolutionMeters = Math.max(
    requestedResolution,
    (maxX - minX) / maxIntervals,
    (maxY - minY) / maxIntervals
  );
  const columns = Math.ceil((maxX - minX) / resolutionMeters) + 1;
  const rows = Math.ceil((maxY - minY) / resolutionMeters) + 1;

  if (rows * columns > CONFIG.grid.maximumDimension ** 2) {
    throw new RangeError('The requested route area exceeds the terrain grid limit.');
  }

  const grid = {
    rows,
    columns,
    resolutionMeters,
    centerLatitude,
    centerLongitude,
    minX,
    maxY,
    longitudeScale,
    latitudeScale,
    start,
    destination
  };
  grid.startCell = coordinateToGridCell(grid, start);
  grid.destinationCell = coordinateToGridCell(grid, destination);
  return grid;
}

function coordinateToGridCell(grid, coordinate) {
  const longitudeDelta = normalizeLongitudeDelta(
    coordinate.longitude - grid.centerLongitude
  );
  const localX = longitudeDelta * DEG_TO_RAD * grid.longitudeScale;
  const localY =
    (coordinate.latitude - grid.centerLatitude) * DEG_TO_RAD * grid.latitudeScale;
  return {
    row: Math.max(
      0,
      Math.min(
        grid.rows - 1,
        Math.round((grid.maxY - localY) / grid.resolutionMeters)
      )
    ),
    column: Math.max(
      0,
      Math.min(
        grid.columns - 1,
        Math.round((localX - grid.minX) / grid.resolutionMeters)
      )
    )
  };
}

function gridCellToCoordinate(grid, row, column) {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    row >= grid.rows ||
    column < 0 ||
    column >= grid.columns
  ) {
    throw new RangeError('Grid row or column is outside the terrain grid.');
  }
  const localX = grid.minX + column * grid.resolutionMeters;
  const localY = grid.maxY - row * grid.resolutionMeters;
  return {
    latitude:
      Math.max(
        -MAX_GRID_LATITUDE,
        Math.min(
          MAX_GRID_LATITUDE,
          grid.centerLatitude +
            localY / grid.latitudeScale / DEG_TO_RAD
        )
      ),
    longitude:
      ((grid.centerLongitude +
        localX / grid.longitudeScale / DEG_TO_RAD +
        540) %
        360) -
      180
  };
}

function rasterCoordinateToCell(metadata, latitude, longitude) {
  if (
    !metadata ||
    !Number.isInteger(metadata.width) ||
    !Number.isInteger(metadata.height) ||
    !Number.isFinite(metadata.xmin) ||
    !Number.isFinite(metadata.ymax) ||
    !Number.isFinite(metadata.pixelSizeX) ||
    !Number.isFinite(metadata.pixelSizeY) ||
    metadata.pixelSizeX === 0 ||
    metadata.pixelSizeY === 0
  ) {
    throw new TypeError('Raster metadata must include dimensions, origin, and pixel sizes.');
  }
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new TypeError('Latitude and longitude must be valid geographic coordinates.');
  }

  const column = Math.floor(
    (longitude -
      (metadata.originX ??
        (metadata.pixelSizeX > 0 ? metadata.xmin : metadata.xmax))) /
      metadata.pixelSizeX
  );
  const row = Math.floor(
    metadata.originY !== undefined
      ? (latitude - metadata.originY) / metadata.pixelSizeY
      : (metadata.ymax - latitude) / Math.abs(metadata.pixelSizeY)
  );
  if (!Number.isFinite(column) || !Number.isFinite(row)) return null;
  if (
    row < 0 ||
    row >= metadata.height ||
    column < 0 ||
    column >= metadata.width
  ) {
    return null;
  }
  return { row, column };
}

function getElevation(grid, row, column) {
  if (
    row < 0 ||
    row >= grid.rows ||
    column < 0 ||
    column >= grid.columns
  ) {
    return null;
  }
  const value = grid.elevations[row * grid.columns + column];
  return Number.isFinite(value) ? value : null;
}

function getAxisGradient(center, before, after, spacing) {
  if (before !== null && after !== null) {
    return (after - before) / (spacing * 2);
  }
  if (after !== null) return (after - center) / spacing;
  if (before !== null) return (center - before) / spacing;
  return null;
}

function analyzeTerrain(grid, hazards = [], geologyZones = []) {
  const totalCells = grid.rows * grid.columns;
  if (
    grid.elevations.length !== totalCells ||
    grid.elevations.some((elevation) =>
      Number.isFinite(elevation)
        ? elevation < CONFIG.nasaMola.minimumElevationMeters ||
          elevation > CONFIG.nasaMola.maximumElevationMeters
        : elevation !== null
    )
  ) {
    throw new TypeError(
      'Terrain elevations must match the grid and use null for missing or NoData cells.'
    );
  }
  if (!Array.isArray(hazards)) {
    throw new TypeError('Hazards must be supplied as an array.');
  }
  if (!Array.isArray(geologyZones)) {
    throw new TypeError('Geology zones must be supplied as an array.');
  }

  const cellAnalysis = Array.from({ length: totalCells }, () => ({
    slopeDegrees: null,
    roughnessMeters: null,
    maxElevationChangeMeters: null,
    state: TERRAIN_STATES.UNKNOWN,
    normalizedPenalty: 0,
    hazardPenalty: 0,
    geologyPenalty: 0,
    geologyCategories: [],
    blockedByHazard: false
  }));
  const terrainConfig = CONFIG.terrain;
  const thresholdScale = Math.max(
    1,
    grid.resolutionMeters / CONFIG.grid.defaultResolutionMeters
  );
  const roughnessThresholds = Object.fromEntries(
    Object.entries(terrainConfig.roughnessMeters).map(([level, threshold]) => [
      level,
      threshold * thresholdScale
    ])
  );
  const elevationChangeThresholds = Object.fromEntries(
    Object.entries(terrainConfig.elevationChangeMeters).map(([level, threshold]) => [
      level,
      threshold * thresholdScale
    ])
  );
  const roughnessRadius =
    terrainConfig.roughnessNeighborhoodRadiusCells;

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const index = row * grid.columns + column;
      const elevation = getElevation(grid, row, column);
      if (elevation === null) continue;

      const latitude = gridCellToCoordinate(grid, row, column).latitude;
      const eastSpacing =
        grid.resolutionMeters *
        Math.cos(latitude * DEG_TO_RAD) /
        Math.max(Math.cos(grid.centerLatitude * DEG_TO_RAD), 0.01);
      const dzdx = getAxisGradient(
        elevation,
        getElevation(grid, row, column - 1),
        getElevation(grid, row, column + 1),
        eastSpacing
      );
      const dzdy = getAxisGradient(
        elevation,
        getElevation(grid, row - 1, column),
        getElevation(grid, row + 1, column),
        grid.resolutionMeters
      );
      const sampleValues = [];
      let maxElevationChangeMeters = 0;
      for (let rowOffset = -roughnessRadius; rowOffset <= roughnessRadius; rowOffset += 1) {
        for (
          let columnOffset = -roughnessRadius;
          columnOffset <= roughnessRadius;
          columnOffset += 1
        ) {
          const sample = getElevation(
            grid,
            row + rowOffset,
            column + columnOffset
          );
          if (sample === null) continue;
          const expectedElevation =
            elevation +
            dzdx * columnOffset * eastSpacing +
            dzdy * rowOffset * grid.resolutionMeters;
          const localRelief = sample - expectedElevation;
          sampleValues.push(localRelief);
          maxElevationChangeMeters = Math.max(
            maxElevationChangeMeters,
            Math.abs(localRelief)
          );
        }
      }

      if (dzdx === null || dzdy === null || sampleValues.length < 2) continue;
      const mean =
        sampleValues.reduce((sum, value) => sum + value, 0) /
        sampleValues.length;
      const roughnessMeters = Math.sqrt(
        sampleValues.reduce(
          (sum, value) => sum + (value - mean) ** 2,
          0
        ) / sampleValues.length
      );
      cellAnalysis[index] = {
        slopeDegrees:
          (Math.atan(Math.hypot(dzdx, dzdy)) / DEG_TO_RAD),
        roughnessMeters,
        maxElevationChangeMeters,
        state: TERRAIN_STATES.SAFE,
        normalizedPenalty: 0,
        hazardPenalty: 0,
        geologyPenalty: 0,
        geologyCategories: [],
        blockedByHazard: false
      };
    }
  }

  applyHazards(grid, cellAnalysis, hazards);
  applyGeologyZones(grid, cellAnalysis, geologyZones);
  cellAnalysis.forEach((cell) => {
    if (cell.state === TERRAIN_STATES.UNKNOWN) return;
    const slope = cell.slopeDegrees;
    const roughness = cell.roughnessMeters;
    const elevationChange = cell.maxElevationChangeMeters;
    if (
      slope > terrainConfig.slopeDegrees.highRisk ||
      roughness > roughnessThresholds.highRisk ||
      elevationChange > elevationChangeThresholds.highRisk ||
      cell.blockedByHazard
    ) {
      cell.state = TERRAIN_STATES.RESTRICTED;
    } else if (
      slope > terrainConfig.slopeDegrees.caution ||
      roughness > roughnessThresholds.caution ||
      elevationChange > elevationChangeThresholds.caution
    ) {
      cell.state = TERRAIN_STATES.HIGH_RISK;
    } else if (
      slope > terrainConfig.slopeDegrees.preferred ||
      roughness > roughnessThresholds.preferred ||
      elevationChange > elevationChangeThresholds.preferred
    ) {
      cell.state = TERRAIN_STATES.CAUTION;
    }

    const weights = CONFIG.costWeights;
    cell.normalizedPenalty =
      weights.slope *
        Math.min(slope / terrainConfig.slopeDegrees.highRisk, 1) +
      weights.roughness *
        Math.min(roughness / roughnessThresholds.highRisk, 1) +
      weights.elevationChange *
        Math.min(
          elevationChange / elevationChangeThresholds.highRisk,
          1
        ) +
      weights.hazard * cell.hazardPenalty +
      cell.geologyPenalty;
  });

  return cellAnalysis;
}

function applyGeologyZones(grid, cells, zones) {
  if (zones.length > 1000) {
    throw new RangeError('No more than 1,000 geology zones may be used for a route.');
  }
  for (const zone of zones) {
    if (
      !zone ||
      typeof zone !== 'object' ||
      !Array.isArray(zone.polygon) ||
      zone.polygon.length < 3
    ) {
      throw new TypeError('Each geology zone must include a polygon with at least three points.');
    }
    const preference = zone.preference ?? 0;
    if (
      !Number.isFinite(preference) ||
      preference < CONFIG.geologyPreferences.minimumCostAdjustment ||
      preference > CONFIG.geologyPreferences.maximumCostAdjustment
    ) {
      throw new RangeError('Geology-zone cost adjustments are outside the configured range.');
    }
    const polygon = zone.polygon.map((coordinate) => {
      if (!isValidCoordinate(coordinate)) {
        throw new TypeError('Geology-zone polygon coordinates must be valid.');
      }
      return toLocalPosition(grid, coordinate);
    });
    const isHazard = zone.category === 'hazard';

    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const index = row * grid.columns + column;
        const cell = cells[index];
        if (cell.state === TERRAIN_STATES.UNKNOWN) continue;
        const local = {
          x: grid.minX + column * grid.resolutionMeters,
          y: grid.maxY - row * grid.resolutionMeters
        };
        if (!pointInPolygon(local, polygon)) continue;
        if (isHazard) {
          cell.blockedByHazard = true;
          cell.hazardPenalty = 1;
          cell.state = TERRAIN_STATES.RESTRICTED;
        } else {
          cell.geologyPenalty = Math.min(cell.geologyPenalty, preference);
        }
        if (zone.category && !cell.geologyCategories.includes(zone.category)) {
          cell.geologyCategories.push(zone.category);
        }
      }
    }
  }
}

function thermalTransitionPenalty(colors, fromIndex, toIndex) {
  if (!Array.isArray(colors)) return 0;
  const from = colors[fromIndex];
  const to = colors[toIndex];
  if (
    !Array.isArray(from) ||
    !Array.isArray(to) ||
    from.length !== 3 ||
    to.length !== 3
  ) {
    return 0;
  }
  const squaredDifference = from.reduce(
    (sum, channel, index) => sum + (channel - to[index]) ** 2,
    0
  );
  return Math.sqrt(squaredDifference / (3 * 255 ** 2));
}

function applyHazards(grid, cells, hazards) {
  for (const hazard of hazards) {
    if (!hazard || typeof hazard !== 'object') {
      throw new TypeError('Each hazard must be an object.');
    }
    const isPolygon = Array.isArray(hazard.polygon);
    const center = hazard.center || {
      latitude: hazard.latitude ?? hazard.coords?.[0],
      longitude: hazard.longitude ?? hazard.coords?.[1]
    };
    const radiusMeters = hazard.radiusMeters ?? hazard.radius_meters ?? 0;
    const bufferMeters = hazard.bufferMeters ?? CONFIG.hazards.defaultBufferMeters;
    const restricted = hazard.restricted !== false;
    if (
      (!isPolygon && !isValidCoordinate(center)) ||
      !Number.isFinite(radiusMeters) ||
      radiusMeters < 0 ||
      !Number.isFinite(bufferMeters) ||
      bufferMeters < CONFIG.hazards.minimumBufferMeters ||
      bufferMeters > CONFIG.hazards.maximumBufferMeters
    ) {
      throw new TypeError('Hazards must include a valid location, radius, and buffer.');
    }

    const centerLocal = isPolygon ? null : toLocalPosition(grid, center);
    const polygonLocal = isPolygon
      ? hazard.polygon.map((coordinate) => {
          if (!isValidCoordinate(coordinate)) {
            throw new TypeError('Hazard polygon coordinates must be valid.');
          }
          return toLocalPosition(grid, coordinate);
        })
      : null;
    if (isPolygon && polygonLocal.length < 3) {
      throw new TypeError('Hazard polygons need at least three coordinates.');
    }

    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const index = row * grid.columns + column;
        const cell = cells[index];
        if (cell.state === TERRAIN_STATES.UNKNOWN) continue;
        const local = {
          x: grid.minX + column * grid.resolutionMeters,
          y: grid.maxY - row * grid.resolutionMeters
        };
        let distance;
        if (isPolygon) {
          const inside = pointInPolygon(local, polygonLocal);
          distance = inside ? 0 : distanceToPolygon(local, polygonLocal);
        } else {
          distance = Math.hypot(
            local.x - centerLocal.x,
            local.y - centerLocal.y
          );
        }
        if (distance <= radiusMeters + bufferMeters) {
          cell.hazardPenalty = restricted ? 1 : 0.75;
          cell.blockedByHazard = restricted;
          if (restricted) cell.state = TERRAIN_STATES.RESTRICTED;
        }
      }
    }
  }
}

function toLocalPosition(grid, coordinate) {
  return {
    x:
      normalizeLongitudeDelta(coordinate.longitude - grid.centerLongitude) *
      DEG_TO_RAD *
      grid.longitudeScale,
    y:
      (coordinate.latitude - grid.centerLatitude) *
      DEG_TO_RAD *
      grid.latitudeScale
  };
}

function coordinateInsideRestrictedHazard(
  grid,
  coordinate,
  hazards,
  geologyZones = []
) {
  const local = toLocalPosition(grid, coordinate);
  const insideHazard = hazards.some((hazard) => {
    if (hazard.restricted === false) return false;
    const bufferMeters = hazard.bufferMeters ?? CONFIG.hazards.defaultBufferMeters;
    const radiusMeters = hazard.radiusMeters ?? hazard.radius_meters ?? 0;
    if (Array.isArray(hazard.polygon)) {
      const polygon = hazard.polygon.map((point) => toLocalPosition(grid, point));
      return (
        pointInPolygon(local, polygon) ||
        distanceToPolygon(local, polygon) <= radiusMeters + bufferMeters
      );
    }
    const center = hazard.center || {
      latitude: hazard.latitude ?? hazard.coords?.[0],
      longitude: hazard.longitude ?? hazard.coords?.[1]
    };
    const centerLocal = toLocalPosition(grid, center);
    return (
      Math.hypot(local.x - centerLocal.x, local.y - centerLocal.y) <=
      radiusMeters + bufferMeters
    );
  });
  if (insideHazard) return true;
  return geologyZones.some((zone) => {
    if (zone.category !== 'hazard' || !Array.isArray(zone.polygon)) return false;
    return pointInPolygon(
      local,
      zone.polygon.map((point) => toLocalPosition(grid, point))
    );
  });
}

function findNearestTraversableCell(grid, cells, coordinate) {
  const maximumDistance = Math.max(
    CONFIG.endpoints.maximumSnapDistanceMeters,
    grid.resolutionMeters
  );
  const originCell = coordinateToGridCell(grid, coordinate);
  const searchRadius = Math.ceil(maximumDistance / grid.resolutionMeters);
  let nearest = null;

  for (
    let row = Math.max(0, originCell.row - searchRadius);
    row <= Math.min(grid.rows - 1, originCell.row + searchRadius);
    row += 1
  ) {
    for (
      let column = Math.max(0, originCell.column - searchRadius);
      column <= Math.min(grid.columns - 1, originCell.column + searchRadius);
      column += 1
    ) {
      const index = row * grid.columns + column;
      if (!isCellTraversable(cells[index])) continue;
      const cellCoordinate = gridCellToCoordinate(grid, row, column);
      const distance = surfaceDistanceMeters(coordinate, cellCoordinate);
      if (distance > maximumDistance || (nearest && distance >= nearest.distance)) {
        continue;
      }
      nearest = {
        cell: { row, column },
        coordinate: cellCoordinate,
        distance
      };
    }
  }

  return nearest;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const a = polygon[index];
    const b = polygon[previous];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x <
        ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(point, polygon) {
  let minimumDistance = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fraction = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start.x) * dx + (point.y - start.y) * dy) /
          (dx * dx + dy * dy || 1)
      )
    );
    minimumDistance = Math.min(
      minimumDistance,
      Math.hypot(point.x - (start.x + fraction * dx), point.y - (start.y + fraction * dy))
    );
  }
  return minimumDistance;
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.items[parentIndex].priority <= item.priority) break;
      this.items[index] = this.items[parentIndex];
      index = parentIndex;
    }
    this.items[index] = item;
  }

  pop() {
    if (this.items.length === 0) return null;
    const minimum = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const child =
          right < this.items.length &&
          this.items[right].priority < this.items[left].priority
            ? right
            : left;
        if (this.items[child].priority >= last.priority) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return minimum;
  }

  get size() {
    return this.items.length;
  }
}

function isCellTraversable(cell) {
  return (
    cell.state !== TERRAIN_STATES.UNKNOWN &&
    cell.state !== TERRAIN_STATES.RESTRICTED &&
    !cell.blockedByHazard
  );
}

function findLowestCostPath(grid, cells, thermalColors) {
  const start = grid.startCell;
  const destination = grid.destinationCell;
  const startIndex = start.row * grid.columns + start.column;
  const destinationIndex =
    destination.row * grid.columns + destination.column;
  if (!isCellTraversable(cells[startIndex])) {
    throw new Error('The starting coordinate has missing or restricted terrain data.');
  }
  if (!isCellTraversable(cells[destinationIndex])) {
    throw new Error('The destination has missing or restricted terrain data.');
  }

  const totalCells = grid.rows * grid.columns;
  const gScore = new Float64Array(totalCells);
  gScore.fill(Infinity);
  const parent = new Int32Array(totalCells);
  parent.fill(-1);
  const closed = new Uint8Array(totalCells);
  const open = new MinHeap();
  gScore[startIndex] = 0;
  open.push({
    index: startIndex,
    priority: heuristic(grid, start, destination)
  });
  const directions = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1]
  ];

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current.index]) continue;
    if (current.index === destinationIndex) {
      return reconstructPath(parent, destinationIndex, grid.columns);
    }
    closed[current.index] = 1;
    const row = Math.floor(current.index / grid.columns);
    const column = current.index % grid.columns;

    for (const [rowOffset, columnOffset] of directions) {
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (
        nextRow < 0 ||
        nextRow >= grid.rows ||
        nextColumn < 0 ||
        nextColumn >= grid.columns
      ) {
        continue;
      }
      const nextIndex = nextRow * grid.columns + nextColumn;
      if (closed[nextIndex] || !isCellTraversable(cells[nextIndex])) continue;
      if (rowOffset !== 0 && columnOffset !== 0) {
        const horizontalIndex = row * grid.columns + nextColumn;
        const verticalIndex = nextRow * grid.columns + column;
        if (
          !isCellTraversable(cells[horizontalIndex]) ||
          !isCellTraversable(cells[verticalIndex])
        ) {
          continue;
        }
      }

      const distance = Math.hypot(
        columnOffset * grid.resolutionMeters,
        rowOffset * grid.resolutionMeters
      );
      const nextCell = cells[nextIndex];
      const penalty =
        (cells[current.index].normalizedPenalty +
          nextCell.normalizedPenalty) /
        2 +
        CONFIG.costWeights.thermalTransition *
          thermalTransitionPenalty(thermalColors, current.index, nextIndex);
      const tentativeScore =
        gScore[current.index] +
        distance * Math.max(0.5, 1 + penalty);
      if (tentativeScore >= gScore[nextIndex]) continue;
      parent[nextIndex] = current.index;
      gScore[nextIndex] = tentativeScore;
      const next = { row: nextRow, column: nextColumn };
      open.push({
        index: nextIndex,
        priority: tentativeScore + heuristic(grid, next, destination)
      });
    }
  }

  throw new Error('No safe route exists through the available terrain grid.');
}

function heuristic(grid, from, to) {
  return (
    Math.hypot(
      (to.column - from.column) * grid.resolutionMeters,
      (to.row - from.row) * grid.resolutionMeters
    ) * 0.5 || 0
  );
}

function reconstructPath(parent, destinationIndex, columns) {
  const path = [];
  for (
    let index = destinationIndex;
    index !== -1;
    index = parent[index]
  ) {
    path.push({
      row: Math.floor(index / columns),
      column: index % columns
    });
  }
  return path.reverse();
}

function surfaceDistanceMeters(start, destination) {
  const lat1 = start.latitude * DEG_TO_RAD;
  const lat2 = destination.latitude * DEG_TO_RAD;
  const deltaLat = lat2 - lat1;
  const deltaLon =
    normalizeLongitudeDelta(destination.longitude - start.longitude) *
    DEG_TO_RAD;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;
  return (
    2 *
    CONFIG.marsEquatorialRadiusMeters *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function calculateRoute(
  grid,
  hazards = [],
  metadata = {},
  environment = {}
) {
  const geologyZones = environment.geologyZones || [];
  const thermalColors = environment.thermalInertiaColors;
  if (
    thermalColors !== undefined &&
    (!Array.isArray(thermalColors) ||
      thermalColors.length !== grid.rows * grid.columns ||
      thermalColors.some((color) =>
        color !== null &&
        (!Array.isArray(color) ||
          color.length !== 3 ||
          color.some((channel) =>
            !Number.isInteger(channel) || channel < 0 || channel > 255
          ))
      ))
  ) {
    throw new TypeError('Thermal-inertia colors must match the terrain grid or use null for NoData.');
  }
  const cells = analyzeTerrain(grid, hazards, geologyZones);
  const requestedStart = grid.start;
  const requestedDestination = grid.destination;
  const requestedStartCell = coordinateToGridCell(grid, requestedStart);
  const requestedDestinationCell = coordinateToGridCell(
    grid,
    requestedDestination
  );
  const startNeedsExpandedSearch = !isCellTraversable(
    cells[requestedStartCell.row * grid.columns + requestedStartCell.column]
  );
  const destinationNeedsExpandedSearch = !isCellTraversable(
    cells[
      requestedDestinationCell.row * grid.columns +
        requestedDestinationCell.column
    ]
  );
  if (coordinateInsideRestrictedHazard(
    grid,
    requestedStart,
    hazards,
    geologyZones
  )) {
    throw new Error('The starting coordinate is inside a restricted hazard area.');
  }
  if (coordinateInsideRestrictedHazard(
    grid,
    requestedDestination,
    hazards,
    geologyZones
  )) {
    throw new Error('The destination is inside a restricted hazard area.');
  }
  const start = findNearestTraversableCell(grid, cells, requestedStart);
  if (!start) {
    throw new Error(
      `No traversable terrain was found within ${Math.max(CONFIG.endpoints.maximumSnapDistanceMeters, grid.resolutionMeters)} metres of the starting coordinate.`
    );
  }
  const destination = findNearestTraversableCell(
    grid,
    cells,
    requestedDestination
  );
  if (!destination) {
    throw new Error(
      `No traversable terrain was found within ${Math.max(CONFIG.endpoints.maximumSnapDistanceMeters, grid.resolutionMeters)} metres of the destination.`
    );
  }
  if (
    start.cell.row === destination.cell.row &&
    start.cell.column === destination.cell.column &&
    surfaceDistanceMeters(requestedStart, requestedDestination) >
      grid.resolutionMeters
  ) {
    throw new Error(
      'No safe route exists between the selected endpoints at the available terrain resolution.'
    );
  }
  grid.startCell = start.cell;
  grid.destinationCell = destination.cell;
  grid.start = start.coordinate;
  grid.destination = destination.coordinate;
  const path = findLowestCostPath(grid, cells, thermalColors);
  const gridCoordinates = path.map(({ row, column }) =>
    gridCellToCoordinate(grid, row, column)
  );
  const coordinates = [
    grid.start,
    ...gridCoordinates,
    grid.destination
  ].filter((coordinate, index, list) =>
    index === 0 ||
    surfaceDistanceMeters(list[index - 1], coordinate) >= 1
  );

  const routeDistanceMeters = coordinates.slice(1).reduce(
    (distance, coordinate, index) =>
      distance +
      surfaceDistanceMeters(coordinates[index], coordinate),
    0
  );
  let accumulatedTerrainCost = 0;
  let accumulatedThermalTransitionScore = 0;
  let elevationGainMeters = 0;
  let elevationLossMeters = 0;
  const routeCells = path.map(
    ({ row, column }) => cells[row * grid.columns + column]
  );
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const distance = Math.hypot(
      (current.column - previous.column) * grid.resolutionMeters,
      (current.row - previous.row) * grid.resolutionMeters
    );
    const previousCell =
      cells[previous.row * grid.columns + previous.column];
    const currentCell = cells[current.row * grid.columns + current.column];
    const terrainPenalty =
      (previousCell.normalizedPenalty + currentCell.normalizedPenalty) / 2;
    const thermalPenalty = thermalTransitionPenalty(
      thermalColors,
      previous.row * grid.columns + previous.column,
      current.row * grid.columns + current.column
    );
    accumulatedThermalTransitionScore += thermalPenalty;
    accumulatedTerrainCost += distance * (1 + terrainPenalty);
    accumulatedTerrainCost +=
      distance * CONFIG.costWeights.thermalTransition * thermalPenalty;
    const elevationChange =
      getElevation(grid, current.row, current.column) -
      getElevation(grid, previous.row, previous.column);
    if (elevationChange > 0) elevationGainMeters += elevationChange;
    else elevationLossMeters -= elevationChange;
  }
  const startCell = cells[path[0].row * grid.columns + path[0].column];
  const destinationCell =
    cells[path.at(-1).row * grid.columns + path.at(-1).column];
  accumulatedTerrainCost +=
    surfaceDistanceMeters(grid.start, gridCoordinates[0]) *
      (1 + startCell.normalizedPenalty) +
    surfaceDistanceMeters(gridCoordinates.at(-1), grid.destination) *
      (1 + destinationCell.normalizedPenalty);

  const knownRouteCells = routeCells.filter(
    (cell) => cell.state !== TERRAIN_STATES.UNKNOWN
  );
  const slopeValues = knownRouteCells.map((cell) => cell.slopeDegrees);
  const classCounts = Object.values(TERRAIN_STATES).reduce((counts, state) => {
    counts[state] = routeCells.filter((cell) => cell.state === state).length;
    return counts;
  }, {});
  const geologyZoneCounts = {};
  routeCells.forEach((cell) => {
    cell.geologyCategories.forEach((category) => {
      geologyZoneCounts[category] = (geologyZoneCounts[category] || 0) + 1;
    });
  });
  const geologyZonesConsidered = geologyZones.reduce((counts, zone) => {
    counts[zone.category] = (counts[zone.category] || 0) + 1;
    return counts;
  }, {});
  const thermalSampleCount = Array.isArray(thermalColors)
    ? thermalColors.filter(Array.isArray).length
    : 0;
  const restrictedCellsAvoided = cells.filter(
    (cell) => cell.state === TERRAIN_STATES.RESTRICTED
  ).length;
  const blockedUnknownCells = cells.filter(
    (cell) => cell.state === TERRAIN_STATES.UNKNOWN
  ).length;
  const totalCells = grid.rows * grid.columns;

  return {
    status: 'ROUTE_FOUND',
    start: grid.start,
    destination: grid.destination,
    requestedStart,
    requestedDestination,
    endpointSearchRequired: {
      start: startNeedsExpandedSearch,
      destination: destinationNeedsExpandedSearch
    },
    endpointAdjustments: {
      startMeters: start.distance,
      destinationMeters: destination.distance
    },
    routeCoordinates: coordinates,
    routeCells: path.map(({ row, column }) => ({
      ...gridCellToCoordinate(grid, row, column),
      elevationMeters: getElevation(grid, row, column),
      ...cells[row * grid.columns + column]
    })),
    totalDistanceMeters: routeDistanceMeters,
    totalDistanceKilometers: routeDistanceMeters / 1000,
    accumulatedTerrainCostMeters: accumulatedTerrainCost,
    estimatedEffort: {
      index: routeDistanceMeters > 0
        ? accumulatedTerrainCost / routeDistanceMeters
        : 1,
      costEquivalentKilometers: accumulatedTerrainCost / 1000,
      elevationGainMeters,
      elevationLossMeters
    },
    averageSlopeDegrees:
      slopeValues.reduce((sum, slope) => sum + slope, 0) /
      Math.max(slopeValues.length, 1),
    maximumSlopeDegrees: slopeValues.length
      ? Math.max(...slopeValues)
      : null,
    terrainClassCounts: classCounts,
    geologyZoneCounts,
    geologyZonesConsidered,
    thermalInertia: {
      sampledCells: thermalSampleCount,
      transitionScore: accumulatedThermalTransitionScore
    },
    restrictedCellsAvoided: restrictedCellsAvoided,
    unknownCellsBlocked: blockedUnknownCells,
    terrainCoveragePercent: (100 * (totalCells - blockedUnknownCells)) / totalCells,
    confidence: {
      level: 'LOW',
      score: 0.25,
      reason:
        `MOLA cannot detect foot-scale hazards. The TES layer is sampled as a coarse color-transition cue, not calibrated numeric thermal inertia. USGS global geology is regional-scale and does not confirm surface materials or ice. Terrain-relief thresholds are scaled by ${Math.max(1, grid.resolutionMeters / CONFIG.grid.defaultResolutionMeters).toFixed(1)}x for this grid spacing; fine terrain between coarse samples is not assessed. This experimental route is not astronaut-certified.`,
      sourceResolutionMeters: metadata.sourceResolutionMeters ?? null,
      planningResolutionMeters: grid.resolutionMeters,
      nominalHorizontalUncertaintyMeters:
        grid.resolutionMeters / 2 +
        (metadata.sourceResolutionMeters ?? 0) / 2
    },
    terrainThresholdScaleFactor: Math.max(
      1,
      grid.resolutionMeters / CONFIG.grid.defaultResolutionMeters
    ),
    grid: {
      rows: grid.rows,
      columns: grid.columns,
      resolutionMeters: grid.resolutionMeters,
      coordinateSystem: metadata.coordinateSystem || 'Mars geographic degrees (WKID 104905)',
      elevationUnits: metadata.elevationUnits || 'meters'
    },
    heuristic: 'Half Mars surface distance; movement cost is bounded below by 0.5 times distance.',
    dataSource: metadata.dataSource || 'NASA Mars Trek MOLA/HRSC DEM'
  };
}

module.exports = {
  TERRAIN_STATES,
  analyzeTerrain,
  applyGeologyZones,
  calculateRoute,
  coordinateToGridCell,
  createLocalGridGeometry,
  findLowestCostPath,
  gridCellToCoordinate,
  isValidCoordinate,
  rasterCoordinateToCell
};
