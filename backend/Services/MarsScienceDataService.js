const NASA_MARS_ARCGIS =
  'https://trek.nasa.gov/mars/trekarcgis/rest/services';
const GEOLOGY_LAYER = `${NASA_MARS_ARCGIS}/SIM3292_Global_Geology/MapServer/0`;
const MINERAL_LAYER =
  `${NASA_MARS_ARCGIS}/Hydrous_Mineral_Detections_OMEGA_CRISM_clon0/MapServer/0`;
const EXPLORATION_LAYER = `${NASA_MARS_ARCGIS}/EZ/MapServer/0`;
const EXPLORATION_CANDIDATE_LAYERS = [
  { id: 0, name: 'Exploration point', distanceMeters: true },
  { id: 1, name: 'Habitat zone point', distanceMeters: true },
  { id: 2, name: 'Landing zone point', distanceMeters: true },
  { id: 3, name: 'Region of interest', distanceMeters: false },
  { id: 4, name: 'Exploration-zone buffer', distanceMeters: false }
];

function isValidBounds(bounds) {
  return Boolean(
    bounds &&
    Number.isFinite(bounds.west) &&
    Number.isFinite(bounds.south) &&
    Number.isFinite(bounds.east) &&
    Number.isFinite(bounds.north) &&
    bounds.west >= -180 &&
    bounds.east <= 180 &&
    bounds.west < bounds.east &&
    bounds.south >= -90 &&
    bounds.north <= 90 &&
    bounds.south < bounds.north
  );
}

function getGridBounds(grid) {
  const corners = [
    [0, 0],
    [0, grid.columns - 1],
    [grid.rows - 1, 0],
    [grid.rows - 1, grid.columns - 1]
  ].map(([row, column]) => {
    const localX = grid.minX + column * grid.resolutionMeters;
    const localY = grid.maxY - row * grid.resolutionMeters;
    return {
      latitude: Math.max(-89.999, Math.min(89.999,
        grid.centerLatitude + localY / grid.latitudeScale * 180 / Math.PI
      )),
      longitude: grid.centerLongitude + localX / grid.longitudeScale * 180 / Math.PI
    };
  });
  const longitudes = corners.map((point) => point.longitude);
  const latitudes = corners.map((point) => point.latitude);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  if (west < -180) {
    return [
      { west: -180, south, east: east, north },
      { west: west + 360, south, east: 180, north }
    ];
  }
  if (east > 180) {
    return [
      { west, south, east: 180, north },
      { west: -180, south, east: east - 360, north }
    ];
  }
  return [{ west, south, east, north }];
}

async function queryLayer(layerUrl, bounds, outFields) {
  if (!isValidBounds(bounds)) {
    throw new TypeError('Mars science-data bounds must be a valid geographic rectangle.');
  }

  const parameters = new URLSearchParams({
    where: '1=1',
    geometry: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '104905',
    outSR: '104905',
    outFields,
    returnGeometry: 'true',
    f: 'json'
  });
  const response = await fetch(`${layerUrl}/query?${parameters}`, {
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    throw new Error(`NASA Mars Trek science layer returned HTTP ${response.status}.`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(
      `NASA Mars Trek science layer query failed: ${result.error.message || 'unknown error'}.`
    );
  }
  if (result.exceededTransferLimit) {
    throw new Error('NASA Mars Trek returned too many science features for this route area.');
  }
  return result.features || [];
}

async function queryExplorationAtPoint(layerUrl, coordinate, outFields, radiusMeters) {
  const parameters = new URLSearchParams({
    where: '1=1',
    geometry: `${coordinate.longitude},${coordinate.latitude}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '104905',
    outSR: '104905',
    outFields,
    returnGeometry: 'false',
    f: 'json'
  });
  if (radiusMeters > 0) {
    parameters.set('distance', String(radiusMeters));
    parameters.set('units', 'esriSRUnit_Meter');
  }
  const response = await fetch(`${layerUrl}/query?${parameters}`, {
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error(`NASA Mars Trek exploration query returned HTTP ${response.status}.`);
  }
  const result = await response.json();
  if (result.error) {
    throw new Error(
      `NASA Mars Trek exploration query failed: ${result.error.message || 'unknown error'}.`
    );
  }
  if (result.exceededTransferLimit) {
    throw new Error('NASA Mars Trek returned too many exploration features for this click.');
  }
  return result.features || [];
}

function signedRingArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function getOuterRings(geometry) {
  if (!Array.isArray(geometry?.rings) || geometry.rings.length === 0) return [];
  const rings = geometry.rings.filter((ring) =>
    Array.isArray(ring) &&
    ring.length >= 4 &&
    ring.every((point) =>
      Array.isArray(point) &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1])
    )
  );
  if (!rings.length) return [];
  const outerOrientation = Math.sign(signedRingArea(rings[0]));
  return rings
    .filter((ring) => Math.sign(signedRingArea(ring)) === outerOrientation)
    .map((ring) => ring.map(([longitude, latitude]) => ({ latitude, longitude })));
}

function classifyGeologyUnit(description) {
  const unit = String(description || '').toLowerCase();
  if (unit.includes('dune') || unit.includes('bedform')) {
    return { category: 'hazard' };
  }
  if (unit.includes('crater ejecta') || unit.includes('highland')) {
    return { category: 'crater_ejecta_highland' };
  }
  if (unit.includes('edifice') || unit.includes('massif')) {
    return { category: 'hazard' };
  }
  if (unit.includes('apron') || unit.includes('outflow')) {
    return { category: 'water_ice_target' };
  }
  if (unit.includes('lowland') || unit.includes('basin')) {
    return { category: 'preferred_transit' };
  }
  if (unit.includes('amazonian') && unit.includes('volcanic')) {
    return { category: 'volcanic_habitat_candidate' };
  }
  return null;
}

function createGeologyZones(features) {
  return features.flatMap((feature) => {
    const attributes = feature.attributes || {};
    const description = attributes.UnitDesc || attributes.Unit;
    const classification = classifyGeologyUnit(description);
    if (!classification) return [];
    const rings = getOuterRings(feature.geometry);
    return rings.map((polygon, index) => ({
      id: `usgs-geology-${attributes.OBJECTID ?? attributes.FID ?? 'feature'}-${index}`,
      name: description,
      category: classification.category,
      polygon
    }));
  });
}

function mapMineralFeature(feature) {
  const attributes = feature.attributes || {};
  const longitude = Number(attributes.Longitude ?? feature.geometry?.x);
  const latitude = Number(attributes.Latitude ?? feature.geometry?.y);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return {
    id: `mineral-${attributes.FID ?? feature.geometry?.x + '-' + feature.geometry?.y}`,
    name: [
      `${attributes.Type || 'Hydrous mineral detection'} candidate`,
      attributes.Instrument
    ].filter(Boolean).join(' · '),
    latitude,
    longitude,
    type: attributes.Type || 'Hydrous mineral detection',
    instrument: attributes.Instrument || 'OMEGA/CRISM',
    source: 'NASA Mars Trek Hydrous Mineral Detections (OMEGA, CRISM)'
  };
}

function mapExplorationFeature(feature) {
  const attributes = feature.attributes || {};
  const longitude = Number(attributes.lon ?? feature.geometry?.x);
  const latitude = Number(attributes.lat ?? feature.geometry?.y);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return {
    id: `exploration-${attributes.FID ?? attributes.name ?? latitude + '-' + longitude}`,
    name: attributes.name || attributes.type || 'USGS exploration-zone site',
    latitude,
    longitude,
    type: attributes.type || 'Exploration Zone',
    status: attributes.status && String(attributes.status).toLowerCase() !== 'none'
      ? attributes.status
      : 'Not specified',
    source: 'NASA Mars Trek Exploration Zones'
  };
}

function mapExplorationDetail(feature, layer) {
  const attributes = feature.attributes || {};
  const toFiniteNumber = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      return NaN;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  };
  const name =
    attributes.name ||
    attributes.ez_name ||
    attributes.name_1 ||
    attributes.LLE_Source ||
    layer.name;
  const latitude = toFiniteNumber(
    attributes.latitude ?? attributes.lat ?? feature.geometry?.y
  );
  const longitude = toFiniteNumber(
    attributes.longitude ?? attributes.lon ?? feature.geometry?.x
  );
  const elevation = toFiniteNumber(attributes.elevation ?? attributes.elev);
  const proposalId = attributes.abstract ?? attributes.ez_abstrac;
  const details = [
    ['Feature type', attributes.Type || attributes.type || layer.name],
    ['Exploration zone', attributes.ez_name],
    [
      'Status',
      attributes.status && String(attributes.status).toLowerCase() !== 'none'
        ? attributes.status
        : ''
    ],
    ['Confidence', attributes.confidence],
    ['Proposal ID', proposalId],
    ['Proposer', attributes.proposer || attributes.reviewer],
    ['Elevation (source value)', Number.isFinite(elevation)
      ? elevation.toLocaleString()
      : ''],
    ['Coordinates', Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `${Math.abs(latitude).toFixed(4)}° ${latitude < 0 ? 'S' : 'N'}, ${Math.abs(longitude).toFixed(4)}° ${longitude < 0 ? 'W' : 'E'}`
      : ''],
    ['NASA Trek source layer', layer.name]
  ].filter(([, value]) =>
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ''
  );
  const abstract = attributes.abstract_l;
  const links = [
    ['NASA proposal / abstract', abstract],
    ['Presentation', attributes.presentati],
    ['Video', attributes.video_link]
  ].filter(([, value]) => isTrustedExplorationLink(value));

  return {
    id: `${layer.id}-${attributes.FID ?? attributes.objectid ?? name}`,
    name: String(name),
    details,
    links
  };
}

function isTrustedExplorationLink(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value);
    const secureHosts = [
      'trek.nasa.gov',
      'nasa.gov',
      'www.nasa.gov',
      'hou.usra.edu',
      'www.hou.usra.edu',
      'youtube.com',
      'www.youtube.com'
    ];
    return (
      (url.protocol === 'https:' && secureHosts.includes(url.hostname)) ||
      (url.protocol === 'http:' && url.hostname === 'www.hou.usra.edu')
    );
  } catch {
    return false;
  }
}

async function identifyExplorationFeatures(latitude, longitude, radiusMeters = 10000) {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new TypeError('A valid exploration click latitude and longitude are required.');
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0 || radiusMeters > 25000) {
    throw new RangeError('Exploration click radius must be between 0 and 25,000 metres.');
  }

  const coordinate = { latitude, longitude };
  const explorationServer = `${NASA_MARS_ARCGIS}/EZMars/MapServer`;
  const layers = [
    {
      ...EXPLORATION_CANDIDATE_LAYERS[0],
      url: EXPLORATION_LAYER,
      fields: 'FID,name,type,status,lat,lon',
      radius: radiusMeters
    },
    ...EXPLORATION_CANDIDATE_LAYERS.map((layer) => ({
      ...layer,
      url: `${explorationServer}/${layer.id}`,
      fields: layer.id === 3
        ? 'FID,name,confidence,ez_name,ez_abstrac'
        : layer.id === 4
          ? 'FID,name,abstract,lat,lon,elev,LLE_Source,Type,abstract_l,presentati,video_link'
          : '*',
      radius: layer.distanceMeters ? radiusMeters : 0
    }))
  ];
  const featureGroups = await Promise.all(
    layers.map((layer) =>
      queryExplorationAtPoint(
        layer.url,
        coordinate,
        layer.fields,
        layer.radius
      )
    )
  );
  const details = new Map();
  featureGroups.forEach((features, index) => {
    features.forEach((feature) => {
      const detail = mapExplorationDetail(feature, layers[index]);
      if (!details.has(detail.id)) details.set(detail.id, detail);
    });
  });
  return Array.from(details.values());
}

async function loadGeologyZones(grid) {
  const bounds = getGridBounds(grid);
  const featureGroups = await Promise.all(
    bounds.map((rectangle) =>
      queryLayer(GEOLOGY_LAYER, rectangle, 'OBJECTID,FID,Unit,UnitDesc')
    )
  );
  const features = new Map();
  featureGroups.flat().forEach((feature) => {
    const attributes = feature.attributes || {};
    const id = attributes.OBJECTID ?? attributes.FID;
    if (id !== undefined) features.set(id, feature);
  });
  return createGeologyZones(Array.from(features.values()));
}

async function loadVisitableSites(bounds) {
  const [mineralFeatures, explorationFeatures] = await Promise.all([
    queryLayer(MINERAL_LAYER, bounds, 'FID,Type,Instrument,Latitude,Longitude'),
    queryLayer(EXPLORATION_LAYER, bounds, 'FID,name,type,status,lat,lon')
  ]);
  return {
    sampleSites: mineralFeatures.map(mapMineralFeature).filter(Boolean),
    explorationSites: explorationFeatures.map(mapExplorationFeature).filter(Boolean)
  };
}

module.exports = {
  classifyGeologyUnit,
  createGeologyZones,
  getGridBounds,
  isValidBounds,
  identifyExplorationFeatures,
  loadGeologyZones,
  loadVisitableSites,
  mapExplorationFeature,
  mapMineralFeature
};
