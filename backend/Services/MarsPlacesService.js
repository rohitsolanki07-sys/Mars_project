const NASA_MARS_ARCGIS =
  'https://trek.nasa.gov/mars/trekarcgis/rest/services';

const PLACE_LAYERS = [
  {
    name: 'Official Mars nomenclature',
    path: 'outreach_nomenclature/MapServer/0',
    fields:
      'clean_name,diameter,category,center_lat,center_lon,type,approvaldt,desc_,link,notes',
    hasGeometry: true
  },
  {
    name: 'Major surface features',
    path: 'major_features/MapServer/0',
    fields: 'name,template,labelNear,labelFar',
    hasGeometry: true
  },
  {
    name: 'Named regions',
    path: 'mars_regions/MapServer/0',
    fields: 'title,lat,lon,level',
    hasGeometry: false
  }
];

function isValidBounds(bounds) {
  return (
    Array.isArray(bounds) &&
    bounds.length === 4 &&
    bounds.every(Number.isFinite) &&
    bounds[0] >= -180 &&
    bounds[0] < bounds[2] &&
    bounds[2] <= 180 &&
    bounds[1] >= -90 &&
    bounds[1] < bounds[3] &&
    bounds[3] <= 90
  );
}

function cleanText(value) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .trim();
}

function normalizeFeature(feature, layer) {
  const attributes = feature.attributes || {};
  const geometry = feature.geometry || {};
  const name =
    cleanText(attributes.clean_name) ||
    cleanText(attributes.name) ||
    cleanText(attributes.title);
  const latitude = Number(
    geometry.y ?? attributes.center_lat ?? attributes.lat
  );
  const longitude = Number(
    geometry.x ?? attributes.center_lon ?? attributes.lon
  );

  if (
    !name ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const diameterKm = Number(attributes.diameter);
  const sourceUrl = cleanText(attributes.link);

  return {
    id: `${layer.path}:${name}:${latitude}:${longitude}`,
    name,
    latitude,
    longitude,
    featureType:
      cleanText(attributes.type) ||
      cleanText(attributes.template) ||
      cleanText(attributes.level),
    category: cleanText(attributes.category),
    sizeKm:
      Number.isFinite(diameterKm) && diameterKm > 0 ? diameterKm : null,
    description:
      cleanText(attributes.desc_) || cleanText(attributes.template),
    notes: cleanText(attributes.notes),
    approvalDate: cleanText(attributes.approvaldt),
    sourceUrl:
      /^https?:\/\/planetarynames\.wr\.usgs\.gov\//i.test(sourceUrl)
        ? sourceUrl.replace(/^http:/i, 'https:')
        : '',
    sourceName: layer.name
  };
}

async function queryLayer(layer, bounds) {
  const [west, south, east, north] = bounds;
  const url = new URL(`${NASA_MARS_ARCGIS}/${layer.path}/query`);
  url.search = new URLSearchParams({
    where: '1=1',
    geometry: JSON.stringify({
      xmin: west,
      ymin: south,
      xmax: east,
      ymax: north,
      spatialReference: { wkid: 104905 }
    }),
    geometryType: 'esriGeometryEnvelope',
    inSR: '104905',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: layer.fields,
    returnGeometry: String(layer.hasGeometry),
    f: 'json'
  }).toString();

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`${layer.name} returned HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(
      `${layer.name}: ${result.error.message || 'NASA query failed'}`
    );
  }

  return (result.features || [])
    .map((feature) => normalizeFeature(feature, layer))
    .filter(Boolean);
}

async function getMarsPlaces(bounds) {
  if (!isValidBounds(bounds)) {
    throw new TypeError('A valid west,south,east,north map area is required.');
  }

  // One NASA layer can fail while others still provide useful place names.
  const results = await Promise.allSettled(
    PLACE_LAYERS.map((layer) => queryLayer(layer, bounds))
  );
  const places = [];
  const warnings = [];
  const seen = new Set();

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      warnings.push(PLACE_LAYERS[index].name);
      return;
    }

    for (const place of result.value) {
      const key = `${place.name.toLowerCase()}:${place.latitude.toFixed(5)}:${place.longitude.toFixed(5)}`;
      if (!seen.has(key)) {
        seen.add(key);
        places.push(place);
      }
    }
  });

  if (places.length === 0 && warnings.length === PLACE_LAYERS.length) {
    throw new Error(`All NASA Mars place-name sources failed: ${warnings.join(', ')}`);
  }

  return { places, warnings };
}

module.exports = { getMarsPlaces, isValidBounds };
