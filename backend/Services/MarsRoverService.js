const NASA_MARS_ARCGIS =
  'https://trek.nasa.gov/mars/trekarcgis/rest/services';
const CURIOSITY_PATH_LAYER = 'curiosity_path/MapServer/0';
const CURIOSITY_WAYPOINT_LAYER = 'curiosity_waypoints/MapServer/0';
const PERSEVERANCE_PATH_LAYER = 'Perseverance_Traverse_Path/MapServer/0';
const PERSEVERANCE_WAYPOINT_LAYER = 'mars2020_waypoints/MapServer/0';
const PERSEVERANCE_LANDING_ELLIPSE_LAYER =
  'perseverance_landing_ellipse/MapServer/0';
const MAX_PATH_VERTICES = 1800;

function isValidCoordinate(coordinate) {
  return (
    Array.isArray(coordinate) &&
    coordinate.length >= 2 &&
    Number.isFinite(Number(coordinate[0])) &&
    Number.isFinite(Number(coordinate[1])) &&
    Number(coordinate[0]) >= -180 &&
    Number(coordinate[0]) <= 180 &&
    Number(coordinate[1]) >= -90 &&
    Number(coordinate[1]) <= 90
  );
}

function simplifyPath(coordinates) {
  const validCoordinates = coordinates.filter(isValidCoordinate);
  if (validCoordinates.length <= MAX_PATH_VERTICES) return validCoordinates;

  const lastIndex = validCoordinates.length - 1;
  return Array.from({ length: MAX_PATH_VERTICES }, (_, index) =>
    validCoordinates[Math.round((index * lastIndex) / (MAX_PATH_VERTICES - 1))]
  );
}

async function fetchFeatureLayer(layerPath) {
  const url = new URL(`${NASA_MARS_ARCGIS}/${layerPath}/query`);
  url.search = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson'
  }).toString();

  const response = await fetch(url, {
    headers: { Accept: 'application/geo+json, application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error(`NASA Mars Trek returned HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(result.error.message || 'NASA Mars Trek query failed.');
  }
  if (!Array.isArray(result.features)) {
    throw new Error('NASA Mars Trek returned an invalid feature layer.');
  }
  return result.features;
}

async function getCuriosityLayers() {
  const [pathFeatures, waypointFeatures] = await Promise.all([
    fetchFeatureLayer(CURIOSITY_PATH_LAYER),
    fetchFeatureLayer(CURIOSITY_WAYPOINT_LAYER)
  ]);
  const traverse = pathFeatures
    .flatMap((feature) => {
      const geometry = feature.geometry;
      if (geometry?.type === 'LineString') return [geometry.coordinates];
      if (geometry?.type === 'MultiLineString') return geometry.coordinates;
      return [];
    })
    .map(simplifyPath)
    .filter((coordinates) => coordinates.length > 1);

  const waypoints = waypointFeatures
    .map((feature) => {
      const name = String(feature.properties?.name || '').trim();
      const coordinate = feature.geometry?.coordinates;
      if (!name || !isValidCoordinate(coordinate)) return null;

      const template = String(feature.properties?.template || '');
      const sourceUrl = /^jpl\/assets\/features\/curiosity\/[\w-]+\.html$/i.test(
        template
      )
        ? `https://trek.nasa.gov/mars/${template}`
        : '';

      return {
        name,
        longitude: Number(coordinate[0]),
        latitude: Number(coordinate[1]),
        sourceUrl
      };
    })
    .filter(Boolean);

  if (traverse.length === 0 || waypoints.length === 0) {
    throw new Error('NASA Mars Trek returned no usable Curiosity rover data.');
  }

  return { traverse, waypoints };
}

function normalizePath(coordinates) {
  return simplifyPath(coordinates)
    .map(([longitude, latitude]) => [Number(longitude), Number(latitude)]);
}

function getPerseveranceWaypoint(feature) {
  const name = String(feature.properties?.name || '').trim();
  const coordinate = feature.geometry?.coordinates;
  if (!name || !isValidCoordinate(coordinate)) return null;

  let sourceUrl = '';
  const template = String(feature.properties?.template || '');
  if (template) {
    const candidate = new URL(template, 'https://trek.nasa.gov');
    if (
      candidate.protocol === 'https:' &&
      candidate.hostname === 'trek.nasa.gov' &&
      candidate.pathname.startsWith('/assets/bookmarks/mars/perseverance/')
    ) {
      sourceUrl = candidate.href;
    }
  }

  return {
    name,
    longitude: Number(coordinate[0]),
    latitude: Number(coordinate[1]),
    sourceUrl
  };
}

async function getPerseveranceLayers() {
  const [pathFeatures, waypointFeatures, landingEllipseFeatures] =
    await Promise.all([
      fetchFeatureLayer(PERSEVERANCE_PATH_LAYER),
      fetchFeatureLayer(PERSEVERANCE_WAYPOINT_LAYER),
      fetchFeatureLayer(PERSEVERANCE_LANDING_ELLIPSE_LAYER)
    ]);

  const traverse = pathFeatures
    .flatMap((feature) => {
      const geometry = feature.geometry;
      if (geometry?.type === 'LineString') return [geometry.coordinates];
      if (geometry?.type === 'MultiLineString') return geometry.coordinates;
      return [];
    })
    .map(normalizePath)
    .filter((coordinates) => coordinates.length > 1);
  const waypoints = waypointFeatures
    .map(getPerseveranceWaypoint)
    .filter(Boolean);
  const landingEllipse = landingEllipseFeatures
    .flatMap((feature) =>
      feature.geometry?.type === 'Polygon' ? feature.geometry.coordinates : []
    )
    .map(normalizePath)
    .filter((ring) => ring.length > 3);

  if (traverse.length === 0 || waypoints.length === 0 || landingEllipse.length === 0) {
    throw new Error('NASA Mars Trek returned incomplete Perseverance rover data.');
  }

  return { traverse, waypoints, landingEllipse };
}

module.exports = { getCuriosityLayers, getPerseveranceLayers };
