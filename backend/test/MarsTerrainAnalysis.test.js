const assert = require('node:assert/strict');
const test = require('node:test');

const CONFIG = require('../Services/TerrainNavigationConfig');
const {
  TERRAIN_STATES,
  analyzeTerrain,
  calculateRoute,
  coordinateToGridCell,
  createLocalGridGeometry,
  findLowestCostPath,
  gridCellToCoordinate,
  rasterCoordinateToCell
} = require('../Services/MarsTerrainAnalysis');

function makeGrid(rows, columns, elevations, resolutionMeters = 500) {
  return {
    rows,
    columns,
    resolutionMeters,
    centerLatitude: 0,
    centerLongitude: 0,
    minX: -((columns - 1) * resolutionMeters) / 2,
    maxY: ((rows - 1) * resolutionMeters) / 2,
    longitudeScale: CONFIG.marsEquatorialRadiusMeters,
    latitudeScale: CONFIG.marsEquatorialRadiusMeters,
    start: { latitude: 0, longitude: 0 },
    destination: { latitude: 0, longitude: 0 },
    startCell: { row: Math.floor(rows / 2), column: 0 },
    destinationCell: { row: Math.floor(rows / 2), column: columns - 1 },
    elevations
  };
}

function flatGrid(rows = 9, columns = 9, resolutionMeters = 500) {
  return makeGrid(rows, columns, new Array(rows * columns).fill(0), resolutionMeters);
}

function countPathLength(path, resolutionMeters) {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    total += Math.hypot(
      (path[index].column - path[index - 1].column) * resolutionMeters,
      (path[index].row - path[index - 1].row) * resolutionMeters
    );
  }
  return total;
}

test('flat terrain returns the shortest any-angle route and usable statistics', () => {
  const grid = flatGrid();
  grid.start = gridCellToCoordinate(grid, 4, 0);
  grid.destination = gridCellToCoordinate(grid, 4, 8);
  const result = calculateRoute(grid);

  assert.equal(result.status, 'ROUTE_FOUND');
  assert.ok(Math.abs(result.totalDistanceMeters - 4000) < 0.01);
  assert.equal(result.averageSlopeDegrees, 0);
  assert.equal(result.maximumSlopeDegrees, 0);
  assert.equal(result.terrainClassCounts[TERRAIN_STATES.SAFE], 9);
  assert.equal(result.confidence.level, 'LOW');
});

test('slopes above 25 degrees are impassable using Mars ground distances', () => {
  const grid = flatGrid(7, 7, 1000);
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      grid.elevations[row * grid.columns + column] = column * 600;
    }
  }
  const cells = analyzeTerrain(grid);
  const center = cells[3 * grid.columns + 3];
  assert.ok(center.slopeDegrees > 25);
  assert.equal(center.state, TERRAIN_STATES.RESTRICTED);
  assert.equal(center.slopePenalty, Infinity);
});

test('a smooth incline is classified by slope, not mistaken for roughness', () => {
  const grid = flatGrid(7, 7, 500);
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      grid.elevations[row * grid.columns + column] =
        column * 50 + row * 30;
    }
  }

  const center = analyzeTerrain(grid)[3 * grid.columns + 3];

  assert.ok(center.slopeDegrees > 5 && center.slopeDegrees < 10);
  assert.ok(center.roughnessMeters < 0.01);
  assert.ok(center.maxElevationChangeMeters < 0.01);
  assert.equal(center.state, TERRAIN_STATES.SAFE);
  assert.equal(center.slopePenalty, 1);
  assert.equal(center.blockedByCrater, false);
});

test('slope penalties follow the safe, moderate, and critical bands', () => {
  for (const [degrees, expectedPenalty] of [
    [8, 1],
    [15, 5],
    [22, 20]
  ]) {
    const grid = flatGrid(7, 7, 1000);
    const risePerCell = Math.tan(degrees * Math.PI / 180) * grid.resolutionMeters;
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        grid.elevations[row * grid.columns + column] = column * risePerCell;
      }
    }

    const center = analyzeTerrain(grid)[3 * grid.columns + 3];
    assert.equal(center.slopePenalty, expectedPenalty);
  }
});

test('high roughness adds cost without making otherwise traversable ground impassable', () => {
  const grid = flatGrid(7, 7, 500);
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      grid.elevations[row * grid.columns + column] =
        (row + column) % 2 === 0 ? 0 : 24;
    }
  }
  const center = analyzeTerrain(grid)[3 * grid.columns + 3];
  assert.ok(center.roughnessMeters > 10);
  assert.equal(center.roughnessPenalty, 10);
  assert.equal(center.costScore, 12);
  assert.equal(center.state, TERRAIN_STATES.HIGH_RISK);
});

test('crater-like closed depressions are blocked and routes detour around them', () => {
  const grid = flatGrid(21, 21, 500);
  const centerRow = 10;
  const centerColumn = 10;
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const distance = Math.hypot(row - centerRow, column - centerColumn);
      let elevation = 0;
      if (distance <= 2) elevation = -100;
      else if (distance <= 4) elevation = -100 + (distance - 2) * 50;
      else if (distance <= 4.5) elevation = (distance - 4) * 160;
      else if (distance <= 5) elevation = 80 - (distance - 4.5) * 160;
      grid.elevations[row * grid.columns + column] = elevation;
    }
  }
  grid.startCell = { row: centerRow, column: 1 };
  grid.destinationCell = { row: centerRow, column: 19 };
  grid.start = gridCellToCoordinate(grid, centerRow, 1);
  grid.destination = gridCellToCoordinate(grid, centerRow, 19);

  const analyzed = analyzeTerrain(grid);
  const center = analyzed[centerRow * grid.columns + centerColumn];
  const innerRim = analyzed[centerRow * grid.columns + centerColumn + 3];
  const outside = analyzed[2 * grid.columns + 2];
  assert.equal(center.blockedByCrater, true);
  assert.equal(innerRim.blockedByCrater, true);
  assert.equal(center.state, TERRAIN_STATES.RESTRICTED);
  assert.equal(outside.blockedByCrater, false);

  const result = calculateRoute(grid);
  assert.ok(result.totalDistanceMeters > 18 * grid.resolutionMeters);
  assert.ok(result.craterAvoidance.blockedCells > 0);
  assert.ok(result.routeCells.every((cell) => !cell.blockedByCrater));
  assert.match(result.confidence.reason, /cannot guarantee a crater-free route/);
});

test('known circular hazards and their configured buffer are impassable', () => {
  const grid = flatGrid(11, 11, 500);
  const cells = analyzeTerrain(grid, [
    {
      name: 'Crater',
      center: { latitude: 0, longitude: 0 },
      radiusMeters: 500,
      bufferMeters: 500
    }
  ]);
  const center = coordinateToGridCell(grid, { latitude: 0, longitude: 0 });
  assert.equal(
    cells[center.row * grid.columns + center.column].state,
    TERRAIN_STATES.RESTRICTED
  );
  const blockedEndpointGrid = { ...grid, startCell: center, destinationCell: center };
  assert.throws(() => calculateRoute(blockedEndpointGrid, [
    {
      name: 'Crater',
      center: { latitude: 0, longitude: 0 },
      radiusMeters: 500,
      bufferMeters: 500
    }
  ]), /starting coordinate is inside a restricted hazard/);
});

test('moves an endpoint off unknown terrain to the nearest traversable cell', () => {
  const grid = flatGrid();
  grid.startCell = { row: 4, column: 0 };
  grid.destinationCell = { row: 4, column: 8 };
  grid.start = gridCellToCoordinate(grid, 4, 0);
  grid.destination = gridCellToCoordinate(grid, 4, 8);
  grid.elevations[4 * grid.columns] = null;
  const requestedStart = grid.start;

  const result = calculateRoute(grid);

  assert.equal(result.requestedStart, requestedStart);
  assert.equal(result.endpointSearchRequired.start, true);
  assert.ok(result.endpointAdjustments.startMeters > 0);
  assert.ok(
    result.endpointAdjustments.startMeters <=
      CONFIG.endpoints.maximumSnapDistanceMeters
  );
  assert.notDeepEqual(result.start, requestedStart);
  assert.notEqual(result.routeCells[0].state, TERRAIN_STATES.UNKNOWN);
});

test('rejects an exact route endpoint inside a hazard even when its nearest cell is outside', () => {
  const grid = flatGrid();
  const cellCoordinate = gridCellToCoordinate(grid, 4, 0);
  grid.start = {
    latitude:
      cellCoordinate.latitude +
      (150 / CONFIG.marsEquatorialRadiusMeters) * (180 / Math.PI),
    longitude: cellCoordinate.longitude
  };
  grid.startCell = { row: 4, column: 0 };
  grid.destinationCell = { row: 4, column: 8 };
  grid.destination = gridCellToCoordinate(grid, 4, 8);

  assert.throws(
    () => calculateRoute(grid, [{
      center: grid.start,
      radiusMeters: 0,
      bufferMeters: 0
    }]),
    /starting coordinate is inside a restricted hazard/
  );
});

test('Theta* takes a longer safe detour around a restricted hazard', () => {
  const grid = flatGrid(11, 11, 500);
  grid.startCell = { row: 5, column: 1 };
  grid.destinationCell = { row: 5, column: 9 };
  grid.start = gridCellToCoordinate(grid, 5, 1);
  grid.destination = gridCellToCoordinate(grid, 5, 9);
  const result = calculateRoute(grid, [{
    name: 'Crater',
    center: { latitude: 0, longitude: 0 },
    radiusMeters: 600,
    bufferMeters: 350
  }]);

  assert.ok(result.totalDistanceMeters > 8 * 500);
  assert.ok(result.routeCells.every((cell) => cell.state !== TERRAIN_STATES.RESTRICTED));
});

test('Theta* routes around polygon hazards', () => {
  const grid = flatGrid(11, 11, 500);
  grid.startCell = { row: 5, column: 1 };
  grid.destinationCell = { row: 5, column: 9 };
  grid.start = gridCellToCoordinate(grid, 5, 1);
  grid.destination = gridCellToCoordinate(grid, 5, 9);
  const result = calculateRoute(grid, [{
    polygon: [
      { latitude: -0.005, longitude: -0.005 },
      { latitude: -0.005, longitude: 0.005 },
      { latitude: 0.005, longitude: 0.005 },
      { latitude: 0.005, longitude: -0.005 }
    ],
    bufferMeters: 0
  }]);

  assert.ok(result.totalDistanceMeters > 8 * 500);
  assert.ok(result.routeCells.every((cell) => cell.state !== TERRAIN_STATES.RESTRICTED));
});

test('USGS hazard-class geology polygons are blocked and detoured around', () => {
  const grid = flatGrid(11, 11, 500);
  grid.startCell = { row: 5, column: 1 };
  grid.destinationCell = { row: 5, column: 9 };
  grid.start = gridCellToCoordinate(grid, 5, 1);
  grid.destination = gridCellToCoordinate(grid, 5, 9);
  const corners = [
    gridCellToCoordinate(grid, 2, 4),
    gridCellToCoordinate(grid, 2, 6),
    gridCellToCoordinate(grid, 8, 6),
    gridCellToCoordinate(grid, 8, 4)
  ];

  const result = calculateRoute(grid, [], {}, {
    geologyZones: [{
      category: 'hazard',
      polygon: corners
    }]
  });

  assert.ok(result.totalDistanceMeters > 8 * grid.resolutionMeters);
  assert.ok(result.routeCells.every((cell) => cell.state !== TERRAIN_STATES.RESTRICTED));
  assert.equal(result.geologyZonesConsidered.hazard, 1);
});

test('science geology zones are reported in route results', () => {
  const grid = flatGrid(9, 9, 500);
  grid.startCell = { row: 4, column: 0 };
  grid.destinationCell = { row: 4, column: 8 };
  grid.start = gridCellToCoordinate(grid, 4, 0);
  grid.destination = gridCellToCoordinate(grid, 4, 8);
  const corners = [
    gridCellToCoordinate(grid, 3, 1),
    gridCellToCoordinate(grid, 3, 7),
    gridCellToCoordinate(grid, 5, 7),
    gridCellToCoordinate(grid, 5, 1)
  ];

  const result = calculateRoute(grid, [], {}, {
    geologyZones: [{
      category: 'water_ice_target',
      polygon: corners
    }]
  });

  assert.ok(result.geologyZoneCounts.water_ice_target > 0);
  assert.ok(result.routeCells.every((cell) => cell.geologyPenalty === 1));
});

test('highland geology costs 3 and mapped dunes remain impassable', () => {
  const grid = flatGrid(7, 7, 500);
  const polygon = [
    gridCellToCoordinate(grid, 2, 2),
    gridCellToCoordinate(grid, 2, 4),
    gridCellToCoordinate(grid, 4, 4),
    gridCellToCoordinate(grid, 4, 2)
  ];
  const highland = analyzeTerrain(grid, [], [{
    category: 'crater_ejecta_highland',
    polygon
  }])[3 * grid.columns + 3];
  assert.equal(highland.geologyPenalty, 3);
  assert.equal(highland.costScore, 5);

  const dunes = analyzeTerrain(grid, [], [{
    category: 'polar_dunes',
    polygon
  }])[3 * grid.columns + 3];
  assert.equal(dunes.state, TERRAIN_STATES.RESTRICTED);

  grid.start = gridCellToCoordinate(grid, 3, 3);
  grid.destination = gridCellToCoordinate(grid, 3, 6);
  assert.throws(
    () => calculateRoute(grid, [], {}, {
      geologyZones: [{ category: 'polar_dunes', polygon }]
    }),
    /starting coordinate is inside a restricted hazard/
  );
});

test('TES thermal-color transitions contribute to route effort reporting', () => {
  const grid = flatGrid(9, 9, 500);
  grid.startCell = { row: 4, column: 0 };
  grid.destinationCell = { row: 4, column: 8 };
  grid.start = gridCellToCoordinate(grid, 4, 0);
  grid.destination = gridCellToCoordinate(grid, 4, 8);
  const thermalInertiaColors = new Array(grid.rows * grid.columns)
    .fill(null)
    .map((_, index) => {
      const column = index % grid.columns;
      return column < 4 ? [20, 40, 60] : [220, 180, 140];
    });

  const result = calculateRoute(grid, [], {}, { thermalInertiaColors });

  assert.equal(result.thermalInertia.sampledCells, grid.rows * grid.columns);
  assert.ok(result.thermalInertia.transitionScore > 0);
});

test('missing elevation is UNKNOWN and never used as a safe path', () => {
  const grid = flatGrid();
  grid.startCell = { row: 4, column: 0 };
  grid.destinationCell = { row: 4, column: 8 };
  grid.elevations[4 * grid.columns + 4] = null;
  const cells = analyzeTerrain(grid);
  assert.equal(cells[4 * grid.columns + 4].state, TERRAIN_STATES.UNKNOWN);
  const result = calculateRoute(grid);
  assert.ok(result.routeCells.every((cell) => cell.state !== TERRAIN_STATES.UNKNOWN));
});

test('rejects invalid coordinates and out-of-range raster metadata cleanly', () => {
  assert.throws(
    () => createLocalGridGeometry(
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: 0 }
    ),
    /valid Mars coordinates/
  );
  assert.throws(
    () => createLocalGridGeometry(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 },
      { resolutionMeters: 10 }
    ),
    /resolution must be between/
  );
  assert.equal(
    rasterCoordinateToCell(
      { width: 100, height: 50, xmin: -180, ymax: 90, pixelSizeX: 1, pixelSizeY: 1 },
      20,
      -100
    ),
    null
  );
});

test('expands the terrain grid to cover the configured 5 km endpoint search', () => {
  const coordinate = { latitude: 0, longitude: 0 };
  const grid = createLocalGridGeometry(coordinate, coordinate, {
    resolutionMeters: 500,
    endpointSearchRangeMeters: CONFIG.endpoints.maximumSnapDistanceMeters
  });
  const farWest = gridCellToCoordinate(grid, Math.floor(grid.rows / 2), 0);
  const farEast = gridCellToCoordinate(
    grid,
    Math.floor(grid.rows / 2),
    grid.columns - 1
  );
  const distanceToWest = Math.abs(farWest.longitude) *
    Math.PI / 180 * CONFIG.marsEquatorialRadiusMeters;
  const distanceToEast = Math.abs(farEast.longitude) *
    Math.PI / 180 * CONFIG.marsEquatorialRadiusMeters;

  assert.equal(CONFIG.endpoints.maximumSnapDistanceMeters, 5000);
  assert.ok(
    distanceToWest >= CONFIG.endpoints.maximumSnapDistanceMeters - 0.01
  );
  assert.ok(
    distanceToEast >= CONFIG.endpoints.maximumSnapDistanceMeters - 0.01
  );
  assert.ok(grid.rows <= CONFIG.grid.maximumDimension);
  assert.ok(grid.columns <= CONFIG.grid.maximumDimension);
  assert.ok(grid.resolutionMeters >= CONFIG.grid.defaultResolutionMeters);
});

test('finds a coarse low-risk route between globally separated coordinates', () => {
  const start = { latitude: 62, longitude: -145 };
  const destination = { latitude: -54, longitude: 112 };
  const grid = createLocalGridGeometry(start, destination, {
    resolutionMeters: CONFIG.grid.maximumResolutionMeters
  });
  grid.elevations = new Array(grid.rows * grid.columns).fill(0);

  const result = calculateRoute(grid);

  assert.equal(result.status, 'ROUTE_FOUND');
  assert.ok(result.totalDistanceKilometers > 5000);
  assert.ok(result.grid.resolutionMeters > CONFIG.grid.maximumResolutionMeters);
  assert.ok(
    result.endpointAdjustments.startMeters <= result.grid.resolutionMeters
  );
  assert.ok(
    result.endpointAdjustments.destinationMeters <= result.grid.resolutionMeters
  );
  assert.ok(result.terrainThresholdScaleFactor > 1);
  assert.match(result.confidence.reason, /fine terrain between coarse samples is not assessed/);
});

test('does not report a zero-length route when distant endpoints snap to one cell', () => {
  const grid = flatGrid(9, 9);
  grid.elevations.fill(null);
  for (let row = 3; row <= 5; row += 1) {
    for (let column = 3; column <= 5; column += 1) {
      grid.elevations[row * grid.columns + column] = 0;
    }
  }
  grid.start = gridCellToCoordinate(grid, 0, 0);
  grid.destination = gridCellToCoordinate(grid, 0, 8);
  const hazards = [];
  for (let row = 3; row <= 5; row += 1) {
    for (let column = 3; column <= 5; column += 1) {
      if (row === 4 && column === 4) continue;
      hazards.push({
        center: gridCellToCoordinate(grid, row, column),
        radiusMeters: 10,
        bufferMeters: 0
      });
    }
  }

  assert.throws(
    () => calculateRoute(grid, hazards),
    /No safe route exists between the selected endpoints/
  );
});

test('returns no route when an unknown-data barrier separates the endpoints', () => {
  const grid = flatGrid(7, 7);
  grid.startCell = { row: 3, column: 0 };
  grid.destinationCell = { row: 3, column: 6 };
  grid.start = gridCellToCoordinate(grid, 3, 0);
  grid.destination = gridCellToCoordinate(grid, 3, 6);
  for (let row = 0; row < grid.rows; row += 1) {
    grid.elevations[row * grid.columns + 3] = null;
  }
  assert.throws(() => calculateRoute(grid), /No safe route exists/);
});

test('diagonal movement cannot cut a corner between blocked cells', () => {
  const grid = flatGrid(3, 3);
  grid.startCell = { row: 1, column: 1 };
  grid.destinationCell = { row: 2, column: 2 };
  const cells = Array.from({ length: 9 }, () => ({
    state: TERRAIN_STATES.SAFE,
    costScore: 3,
    hazardPenalty: 0,
    blockedByHazard: false
  }));
  cells[1 * 3 + 2].state = TERRAIN_STATES.RESTRICTED;
  cells[2 * 3 + 1].state = TERRAIN_STATES.RESTRICTED;
  assert.throws(() => findLowestCostPath(grid, cells), /No safe route exists/);
});

test('local and raster coordinate conversion respect Mars latitude and row direction', () => {
  const start = { latitude: -4.6, longitude: 137.4 };
  const destination = { latitude: -4.58, longitude: 137.42 };
  const grid = createLocalGridGeometry(start, destination, {
    resolutionMeters: 500
  });
  const startCell = coordinateToGridCell(grid, start);
  assert.ok(startCell.row >= 0 && startCell.row < grid.rows);
  assert.ok(startCell.column >= 0 && startCell.column < grid.columns);
  const cellCoordinate = gridCellToCoordinate(grid, startCell.row, startCell.column);
  assert.ok(Math.abs(cellCoordinate.latitude - start.latitude) < 0.01);
  assert.ok(Math.abs(cellCoordinate.longitude - start.longitude) < 0.01);
  assert.deepEqual(
    rasterCoordinateToCell(
      { width: 360, height: 180, xmin: -180, ymax: 90, pixelSizeX: 1, pixelSizeY: 1 },
      20.5,
      -99.5
    ),
    { row: 69, column: 80 }
  );
});

test('global route grids keep sampled latitudes within the valid polar range', () => {
  for (const [start, destination] of [
    [
      { latitude: 90, longitude: 10 },
      { latitude: 88, longitude: 100 }
    ],
    [
      { latitude: -90, longitude: -10 },
      { latitude: -88, longitude: 120 }
    ]
  ]) {
    const grid = createLocalGridGeometry(start, destination, {
      resolutionMeters: CONFIG.grid.maximumResolutionMeters
    });

    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const coordinate = gridCellToCoordinate(grid, row, column);
        assert.ok(coordinate.latitude >= -90 && coordinate.latitude <= 90);
        assert.ok(Math.abs(coordinate.latitude) < 90);
      }
    }
  }
});

test('Theta* returns a direct any-angle path across clear terrain', () => {
  const grid = flatGrid(7, 8);
  grid.startCell = { row: 1, column: 0 };
  grid.destinationCell = { row: 5, column: 7 };
  const cells = analyzeTerrain(grid);
  const path = findLowestCostPath(grid, cells);

  assert.equal(path.length, 2);
  assert.ok(Math.abs(
    countPathLength(path, grid.resolutionMeters) -
      Math.hypot(7, 4) * grid.resolutionMeters
  ) < 0.01);
});

test('Theta* detours around a high-cost corridor when the detour is cheaper', () => {
  const grid = flatGrid(7, 7);
  grid.startCell = { row: 3, column: 0 };
  grid.destinationCell = { row: 3, column: 6 };
  const cells = analyzeTerrain(grid);
  for (let column = 1; column < 6; column += 1) {
    cells[3 * grid.columns + column].costScore = 12;
  }

  const path = findLowestCostPath(grid, cells);

  assert.ok(path.some((cell) => cell.row !== 3));
});
