const MARS_ELLIPSOID = new Cesium.Ellipsoid(3396190, 3396190, 3376200);
const viewer = new Cesium.Viewer('map', {
  animation: false,
  baseLayer: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  selectionIndicator: false,
  timeline: false,
  // Cesium also uses the scene ellipsoid to calculate globe drag sensitivity.
  ellipsoid: MARS_ELLIPSOID,
  globe: new Cesium.Globe(MARS_ELLIPSOID),
  mapProjection: new Cesium.GeographicProjection(MARS_ELLIPSOID),
  terrainProvider: new Cesium.EllipsoidTerrainProvider({
    ellipsoid: MARS_ELLIPSOID
  })
});

viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#100d0d');
viewer.scene.globe.showGroundAtmosphere = false;
if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#060914');
const marsCameraController = viewer.scene.screenSpaceCameraController;
// Mars Trek imagery uses an ellipsoid (no detailed terrain), so allow the
// camera to zoom close to the surface without Cesium's Mars-scaled defaults
// making the globe feel like it has hit a hard stop.
marsCameraController.minimumZoomDistance = 250;
marsCameraController.maximumZoomDistance = 44000000;
marsCameraController.minimumCollisionTerrainHeight = 250;
marsCameraController.minimumPickingTerrainDistanceWithInertia = 250;
marsCameraController.zoomFactor = 10;
marsCameraController.enableTilt = true;
marsCameraController.enableLook = true;
// Cesium's collision check can clamp the Mars-sized globe as if it were Earth.
// Keep the near-surface zoom limit above, but disable that mismatched collision.
marsCameraController.enableCollisionDetection = false;

const mapFrame = document.getElementById('mapFrame');
const mapFullscreenToggle = document.getElementById('mapFullscreenToggle');
const mapSizeLabel = document.getElementById('mapSizeLabel');
let mapResizeTimer = null;

function resizeMarsMapAfterLayout() {
  window.requestAnimationFrame(() => {
    viewer.resize();
    viewer.scene.requestRender();
    window.clearTimeout(mapResizeTimer);
    mapResizeTimer = window.setTimeout(() => {
      viewer.resize();
      viewer.scene.requestRender();
    }, 380);
  });
}

function setMarsMapSize(fullscreen) {
  const expanded = Boolean(fullscreen);
  document.body.dataset.mapSize = expanded ? 'full' : 'window';
  if (mapFullscreenToggle) {
    mapFullscreenToggle.setAttribute('aria-pressed', String(expanded));
    mapFullscreenToggle.setAttribute(
      'aria-label',
      expanded ? 'Restore map window' : 'Expand map to full screen'
    );
    mapFullscreenToggle.title = expanded ? 'Restore map window' : 'Expand map to full screen';
  }
  if (mapSizeLabel) mapSizeLabel.textContent = expanded ? 'Map window' : 'Full screen';
  resizeMarsMapAfterLayout();
}

mapFullscreenToggle?.addEventListener('click', () => {
  setMarsMapSize(document.body.dataset.mapSize !== 'full');
});
window.addEventListener('resize', () => viewer.resize());

viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(77.42, 18.48, 7000000),
  orientation: {
    heading: 0,
    pitch: -Math.PI / 2,
    roll: 0
  }
});

const mapListeners = new Map();
const marsMapContainer = viewer.container;
const mapPopup = document.getElementById('mapPopup');
const mapPopupContent = document.getElementById('mapPopupContent');

function showMapPopup(content, screenPosition) {
  if (!mapPopup || !mapPopupContent) return;
  mapPopupContent.replaceChildren();
  if (content instanceof HTMLElement) {
    mapPopupContent.append(content);
  } else {
    mapPopupContent.textContent = String(content);
  }
  mapPopup.hidden = false;
  const mapBounds = mapFrame.getBoundingClientRect();
  const left = Math.min(
    Math.max(mapBounds.left + 12, mapBounds.left + screenPosition.x + 14),
    mapBounds.right - mapPopup.offsetWidth - 12
  );
  const top = Math.min(
    Math.max(mapBounds.top + 12, mapBounds.top + screenPosition.y + 14),
    mapBounds.bottom - mapPopup.offsetHeight - 12
  );
  mapPopup.style.left = `${left}px`;
  mapPopup.style.top = `${top}px`;
}

function getMarsPosition(screenPosition) {
  const cartesian = viewer.camera.pickEllipsoid(screenPosition, MARS_ELLIPSOID);
  if (!cartesian) return null;
  const cartographic = Cesium.Cartographic.fromCartesian(
    cartesian,
    MARS_ELLIPSOID
  );
  return {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lng: Cesium.Math.toDegrees(cartographic.longitude)
  };
}

function getViewBounds() {
  const rectangle = viewer.camera.computeViewRectangle(MARS_ELLIPSOID);
  if (!rectangle) {
    const width = marsMapContainer.clientWidth;
    const height = marsMapContainer.clientHeight;
    const centerLongitude = Cesium.Math.toDegrees(
      viewer.camera.positionCartographic.longitude
    );
    const visiblePoints = [];

    for (let row = 0; row <= 4; row += 1) {
      for (let column = 0; column <= 4; column += 1) {
        const point = getMarsPosition(
          new Cesium.Cartesian2(
            (width * column) / 4,
            (height * row) / 4
          )
        );
        if (point) {
          const longitudeOffset =
            ((point.lng - centerLongitude + 540) % 360) - 180;
          visiblePoints.push({
            latitude: point.lat,
            longitude: centerLongitude + longitudeOffset
          });
        }
      }
    }

    if (visiblePoints.length) {
      const longitudes = visiblePoints.map((point) => point.longitude);
      const latitudes = visiblePoints.map((point) => point.latitude);
      const west = Math.min(...longitudes);
      const east = Math.max(...longitudes);
      const crossesDateLine = west < -180 || east > 180 || east - west > 180;
      return {
        getWest: () => crossesDateLine ? -180 : west,
        getSouth: () => Math.min(...latitudes),
        getEast: () => crossesDateLine ? 180 : east,
        getNorth: () => Math.max(...latitudes)
      };
    }

    return {
      getWest: () => -180,
      getSouth: () => -90,
      getEast: () => 180,
      getNorth: () => 90
    };
  }

  const west = Cesium.Math.toDegrees(rectangle.west);
  const east = Cesium.Math.toDegrees(rectangle.east);
  return {
    getWest: () => west > east ? -180 : west,
    getSouth: () => Cesium.Math.toDegrees(rectangle.south),
    getEast: () => west > east ? 180 : east,
    getNorth: () => Cesium.Math.toDegrees(rectangle.north)
  };
}

function heightForGlobeZoom(zoom) {
  return 44000000 / (2 ** Math.max(1, Math.min(12, zoom)));
}

const map = {
  on(events, callback) {
    events.split(/\s+/).forEach((event) => {
      if (!mapListeners.has(event)) mapListeners.set(event, new Set());
      mapListeners.get(event).add(callback);
    });
    return this;
  },
  emit(event, payload) {
    mapListeners.get(event)?.forEach((callback) => callback(payload));
  },
  getBounds: getViewBounds,
  getContainer: () => marsMapContainer,
  getSize: () => ({
    x: marsMapContainer.clientWidth,
    y: marsMapContainer.clientHeight
  }),
  getZoom() {
    return Math.max(
      1,
      Math.min(12, Math.log2(44000000 / viewer.camera.positionCartographic.height))
    );
  },
  latLngToContainerPoint([latitude, longitude]) {
    const position = Cesium.Cartesian3.fromDegrees(
      longitude,
      latitude,
      0,
      MARS_ELLIPSOID
    );
    const occluder = new Cesium.EllipsoidalOccluder(
      MARS_ELLIPSOID,
      viewer.camera.positionWC
    );
    if (!occluder.isPointVisible(position)) return null;
    return viewer.scene.cartesianToCanvasCoordinates(position);
  },
  flyTo([latitude, longitude], zoom, options = {}) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        longitude,
        latitude,
        heightForGlobeZoom(zoom),
        MARS_ELLIPSOID
      ),
      orientation: {
        heading: viewer.camera.heading,
        pitch: -Math.PI / 2,
        roll: 0
      },
      duration: options.duration ?? 1
    });
  },
  fitBounds(bounds, options = {}) {
    if (bounds?.points?.length) {
      const positions = bounds.points.map(([latitude, longitude]) =>
        Cesium.Cartesian3.fromDegrees(longitude, latitude, 0, MARS_ELLIPSOID)
      );
      const sphere = Cesium.BoundingSphere.fromPoints(positions);
      const center = Cesium.Cartographic.fromCartesian(
        sphere.center,
        MARS_ELLIPSOID
      );
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromRadians(
          center.longitude,
          center.latitude,
          Math.max(40000, sphere.radius * 3.5),
          MARS_ELLIPSOID
        ),
        orientation: {
          heading: viewer.camera.heading,
          pitch: -Math.PI / 2,
          roll: 0
        },
        duration: options.duration ?? 0.8
      });
      return;
    }

    viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ),
      orientation: {
        heading: viewer.camera.heading,
        pitch: -Math.PI / 2,
        roll: 0
      },
      duration: options.duration ?? 0.8
    });
  },
  hasLayer(layer) {
    return layer.visible ?? layer.show ?? false;
  },
  addLayer(layer) {
    if ('visible' in layer) {
      layer.visible = true;
      layer.entities?.forEach((entity) => { entity.show = true; });
    } else if ('show' in layer) {
      layer.show = true;
    }
  },
  removeLayer(layer) {
    if ('visible' in layer) {
      layer.visible = false;
      layer.entities?.forEach((entity) => { entity.show = false; });
    } else if ('show' in layer) {
      layer.show = false;
    }
  },
  invalidateSize() {
    viewer.resize();
    viewer.scene.requestRender();
  }
};

const marsOverlay = document.createElement('div');
marsOverlay.className = 'mars-globe-entity-overlay';
const marsOverlayGraphics = document.createElementNS(
  'http://www.w3.org/2000/svg',
  'svg'
);
marsOverlayGraphics.setAttribute('class', 'mars-globe-overlay-graphics');
marsOverlayGraphics.setAttribute('aria-hidden', 'true');
const marsOverlayLabels = document.createElement('div');
marsOverlayLabels.className = 'mars-globe-overlay-labels';
marsOverlay.append(marsOverlayGraphics, marsOverlayLabels);
viewer.container.append(marsOverlay);

const marsOverlayNodes = new Map();

function getOverlayPropertyValue(property, time) {
  return property?.getValue ? property.getValue(time) : property;
}

function getOverlayNode(entity) {
  let overlay = marsOverlayNodes.get(entity.id);
  if (overlay?.type === 'circle') return overlay.element;
  overlay?.element.remove();

  const element = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'circle'
  );
  element.setAttribute('class', 'mars-globe-overlay-circle');
  marsOverlayGraphics.append(element);
  marsOverlayNodes.set(entity.id, { type: 'circle', element });
  return element;
}

function getOverlayLabelNode(entity) {
  let overlay = marsOverlayNodes.get(entity.id);
  if (overlay?.type === 'label') return overlay.element;
  overlay?.element.remove();

  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'mars-globe-entity-label';
  element.addEventListener('click', (event) => {
    event.preventDefault();
    const time = viewer.clock.currentTime;
    const position = entity.position?.getValue(time);
    if (!position) return;

    const cartographic = Cesium.Cartographic.fromCartesian(
      position,
      MARS_ELLIPSOID
    );
    const containerBounds = viewer.container.getBoundingClientRect();
    const screenPosition = {
      x: event.clientX - containerBounds.left,
      y: event.clientY - containerBounds.top
    };
    if (entity.mapPopup) showMapPopup(entity.mapPopup, screenPosition);
    map.emit('click', {
      latlng: {
        lat: Cesium.Math.toDegrees(cartographic.latitude),
        lng: Cesium.Math.toDegrees(cartographic.longitude)
      },
      originalEvent: event
    });
  });
  marsOverlayLabels.append(element);
  marsOverlayNodes.set(entity.id, { type: 'label', element });
  return element;
}

function renderMarsEntityOverlay() {
  const time = viewer.clock.currentTime;
  const occluder = new Cesium.EllipsoidalOccluder(
    MARS_ELLIPSOID,
    viewer.camera.positionWC
  );
  const activeIds = new Set();
  const canvasWidth = viewer.canvas.clientWidth;
  const canvasHeight = viewer.canvas.clientHeight;
  const occupiedCuriosityLabels = [];

  viewer.entities.values.forEach((entity) => {
    if (!entity.show) return;
    const ellipse = entity.ellipse;

    const position = entity.position?.getValue(time);
    if (!position) return;
    const screen = occluder.isPointVisible(position)
      ? viewer.scene.cartesianToCanvasCoordinates(position)
      : null;
    if (
      !screen ||
      screen.x < -300 ||
      screen.x > canvasWidth + 300 ||
      screen.y < -100 ||
      screen.y > canvasHeight + 100
    ) {
      return;
    }

    if (ellipse) {
      const circle = getOverlayNode(entity);
      const radius = getOverlayPropertyValue(ellipse.semiMajorAxis, time) || 600;
      const fieldOfView = viewer.camera.frustum.fovy || Math.PI / 3;
      const radiusPixels = Math.max(
        2,
        (radius * canvasHeight) /
          (2 * viewer.camera.positionCartographic.height * Math.tan(fieldOfView / 2))
      );
      const material = getOverlayPropertyValue(ellipse.material, time);
      circle.setAttribute('cx', screen.x.toFixed(1));
      circle.setAttribute('cy', screen.y.toFixed(1));
      circle.setAttribute('r', radiusPixels.toFixed(1));
      circle.setAttribute(
        'fill',
        material?.color?.toCssColorString?.() || 'rgba(234, 67, 53, 0.35)'
      );
      activeIds.add(entity.id);
      return;
    }

    const label = entity.label;
    if (!label || getOverlayPropertyValue(label.show, time) === false) return;
    const labelNode = getOverlayLabelNode(entity);
    const text = getOverlayPropertyValue(label.text, time) || '';
    labelNode.textContent = text;
    labelNode.setAttribute('aria-label', text);
    labelNode.style.left = `${screen.x}px`;
    labelNode.style.top = `${screen.y}px`;
    labelNode.style.display = '';

    let pixelOffset =
      getOverlayPropertyValue(label.pixelOffset, time) || Cesium.Cartesian2.ZERO;
    let horizontalOrigin = getOverlayPropertyValue(label.horizontalOrigin, time);
    let verticalOrigin = getOverlayPropertyValue(label.verticalOrigin, time);
    if (entity.isCuriosityWaypoint) {
      const labelWidth = Math.min(280, Math.max(70, text.length * 7));
      const placement = findLabelPlacement(
        screen,
        labelWidth,
        occupiedCuriosityLabels,
        { x: canvasWidth, y: canvasHeight }
      );
      if (!placement) {
        labelNode.style.display = 'none';
        activeIds.add(entity.id);
        return;
      }
      occupiedCuriosityLabels.push(placement.box);
      const offsets = {
        right: {
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          pixelOffset: new Cesium.Cartesian2(10, 0)
        },
        left: {
          horizontalOrigin: Cesium.HorizontalOrigin.RIGHT,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          pixelOffset: new Cesium.Cartesian2(-10, 0)
        },
        top: {
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12)
        },
        bottom: {
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 12)
        }
      };
      ({ horizontalOrigin, verticalOrigin, pixelOffset } = offsets[placement.direction]);
    }
    labelNode.style.marginLeft = `${pixelOffset.x}px`;
    labelNode.style.marginTop = `${pixelOffset.y}px`;

    const point = entity.point;
    const isPlaceLabel = Boolean(
      point && getOverlayPropertyValue(label.showBackground, time)
    );
    labelNode.classList.toggle('mars-globe-place-label', isPlaceLabel);
    labelNode.classList.toggle('mars-globe-point-label', Boolean(point));
    if (point) {
      const pointColor = getOverlayPropertyValue(point.color, time);
      const pointSize = getOverlayPropertyValue(point.pixelSize, time) || 8;
      labelNode.style.setProperty(
        '--mars-marker-color',
        pointColor?.toCssColorString?.() || '#60a5fa'
      );
      labelNode.style.setProperty('--mars-marker-size', `${pointSize}px`);
    }

    labelNode.dataset.horizontalOrigin =
      horizontalOrigin === Cesium.HorizontalOrigin.LEFT
        ? 'left'
        : horizontalOrigin === Cesium.HorizontalOrigin.RIGHT
          ? 'right'
          : 'center';
    labelNode.dataset.verticalOrigin =
      verticalOrigin === Cesium.VerticalOrigin.TOP
        ? 'top'
        : verticalOrigin === Cesium.VerticalOrigin.CENTER
          ? 'center'
          : 'bottom';
    labelNode.classList.toggle('mars-globe-navigation-label', !point);
    activeIds.add(entity.id);
  });

  marsOverlayNodes.forEach((overlay, id) => {
    if (activeIds.has(id)) return;
    overlay.element.remove();
    marsOverlayNodes.delete(id);
  });
}

viewer.scene.postRender.addEventListener(renderMarsEntityOverlay);

const screenHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
screenHandler.setInputAction((movement) => {
  const picked = viewer.scene.pick(movement.position);
  const entity = Cesium.defined(picked)
    ? picked.id ?? picked.primitive?.id
    : null;
  if (entity?.mapPopup) showMapPopup(entity.mapPopup, movement.position);
  else if (mapPopup) mapPopup.hidden = true;

  const latlng = getMarsPosition(movement.position);
  if (latlng) map.emit('click', { latlng, originalEvent: movement });
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
screenHandler.setInputAction((movement) => {
  const latlng = getMarsPosition(movement.endPosition);
  if (latlng) map.emit('mousemove', { latlng });
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
viewer.camera.moveEnd.addEventListener(() => {
  map.emit('moveend');
  map.emit('zoomend');
});
document.getElementById('mapPopupClose')?.addEventListener('click', () => {
  mapPopup.hidden = true;
});
mapPopup?.addEventListener('pointerdown', (event) => event.stopPropagation());

class GlobeLayerGroup {
  constructor() {
    this.entities = new Set();
    this.visible = true;
  }

  addTo() {
    this.visible = true;
    return this;
  }

  addLayer(entity) {
    this.entities.add(entity);
    entity.show = this.visible;
    return this;
  }

  removeLayer(entity) {
    this.entities.delete(entity);
    viewer.entities.remove(entity);
  }

  clearLayers() {
    this.entities.forEach((entity) => viewer.entities.remove(entity));
    this.entities.clear();
  }

  eachLayer(callback) {
    this.entities.forEach(callback);
  }
}

function createMarsTrekImagery(
  serviceUrl,
  layerName,
  {
    alpha = 1,
    rectangle = Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
    minimumLevel = 0,
    maximumLevel = 14
  } = {}
) {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: `${serviceUrl}?bbox={westDegrees},{southDegrees},{eastDegrees},{northDegrees}&bboxSR=104905&imageSR=104905&size=256,256&format=png32&transparent=true&interpolation=RSP_Bilinear&f=image`,
    tilingScheme: new Cesium.GeographicTilingScheme({
      ellipsoid: MARS_ELLIPSOID,
      numberOfLevelZeroTilesX: 2,
      numberOfLevelZeroTilesY: 1
    }),
    rectangle,
    tileWidth: 256,
    tileHeight: 256,
    minimumLevel,
    maximumLevel,
    credit: new Cesium.Credit(
      `NASA/JPL Mars Trek — ${layerName}`,
      false
    )
  });
  const layer = viewer.imageryLayers.addImageryProvider(provider);
  layer.alpha = alpha;
  return layer;
}

const marsShadedRelief = createMarsTrekImagery(
  'https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_Viking_MDIM21_ClrMosaic_global_232m/ImageServer/exportImage',
  'Viking MDIM 2.1 color mosaic',
  { maximumLevel: 14 }
);
const molaElevationOverlay = createMarsTrekImagery(
  'https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp/ImageServer/exportImage',
  'MOLA/HRSC color-shaded relief',
  { alpha: 0.65 }
);
const curiosityHiRISEImagery = createMarsTrekImagery(
  'https://trek.nasa.gov/mars/trekarcgis/rest/services/curiosity_hirise_mosaic/ImageServer/exportImage',
  'Curiosity HiRISE surface mosaic',
  {
    alpha: 0.78,
    rectangle: Cesium.Rectangle.fromDegrees(
      137.12246691438963,
      -4.925474311955909,
      137.729812906933,
      -4.248958839494268
    ),
    minimumLevel: 5,
    maximumLevel: 19
  }
);
curiosityHiRISEImagery.show = false;
const insightCTXImagery = createMarsTrekImagery(
  'https://trek.nasa.gov/mars/trekarcgis/rest/services/InSightCTXMosaic_112917_gcs/ImageServer/exportImage',
  'InSight CTX surface mosaic',
  {
    alpha: 0.78,
    rectangle: Cesium.Rectangle.fromDegrees(
      133.9357319685767,
      3.728412992963613,
      137.27612990314537,
      5.069616759863639
    ),
    minimumLevel: 5,
    maximumLevel: 19
  }
);
insightCTXImagery.show = false;
// Optional image overlays stay hidden until the user turns them on.
molaElevationOverlay.show = false;
const hazardLayerGroup = new GlobeLayerGroup();
const routeLayerGroup = new GlobeLayerGroup();
const poiLayerGroup = new GlobeLayerGroup();
const terrainRouteLayerGroup = new GlobeLayerGroup();
const placeNamesLayerGroup = new GlobeLayerGroup();
const curiosityTraverseLayerGroup = new GlobeLayerGroup();
const curiosityWaypointLayerGroup = new GlobeLayerGroup();

const themeToggleBtn = document.getElementById('themeToggleBtn');
const APP_THEME_STORAGE_KEY = 'ares-nav-theme';

function setAppTheme(theme, savePreference = false) {
  const selectedTheme = theme === 'dark' ? 'dark' : 'light';
  const darkModeEnabled = selectedTheme === 'dark';
  document.documentElement.dataset.theme = selectedTheme;
  document.body.dataset.theme = selectedTheme;

  if (themeToggleBtn) {
    themeToggleBtn.setAttribute('aria-pressed', String(darkModeEnabled));
    themeToggleBtn.setAttribute(
      'aria-label',
      darkModeEnabled ? 'Switch to light mode' : 'Switch to dark mode'
    );
    themeToggleBtn.title = darkModeEnabled ? 'Switch to light mode' : 'Switch to dark mode';
    const icon = themeToggleBtn.querySelector('span');
    if (icon) icon.textContent = darkModeEnabled ? '☀' : '☾';
  }

  if (savePreference) {
    try {
      window.localStorage.setItem(APP_THEME_STORAGE_KEY, selectedTheme);
    } catch {
      // Keep the current theme for this visit if browser storage is unavailable.
    }
  }
}

let savedAppTheme = 'light';
try {
  savedAppTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY) || 'light';
} catch {
  savedAppTheme = 'light';
}
setAppTheme(savedAppTheme);
themeToggleBtn?.addEventListener('click', () => {
  setAppTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark', true);
});

const NASA_PLACE_LAYERS = [
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
let placeNamesEnabled = false;
let molaLayerEnabled = false;
let hazardsLayerEnabled = false;
let curiosityImageryEnabled = false;
let curiosityRoverEnabled = false;
let insightImageryEnabled = false;
let currentAppView = 'planner';
let placeNamesRequest = null;
let placeNamesRefreshTimer = null;
let lastPlaceNamesBounds = '';
let curiosityDataLoaded = false;
let curiosityDataRequest = null;
let curiosityWaypointCount = 0;
const LOCAL_BACKEND_PORTS = ['3000', '5500', '3001', '3002', '5050', '8080'];

// The terrain legend follows the same toggle as the NASA MOLA overlay.
const molaLegendElement = document.createElement('div');
molaLegendElement.className = 'mola-legend';
molaLegendElement.innerHTML = `
  <h4>NASA MOLA TERRAIN</h4>
  <p>Color-shaded elevation and relief</p>
`;
document.body.append(molaLegendElement);
const molaLegend = {
  addTo() {
    molaLegendElement.hidden = false;
  },
  remove() {
    molaLegendElement.hidden = true;
  }
};
document.getElementById('globeZoomIn')?.addEventListener('click', () => {
  const height = viewer.camera.positionCartographic.height;
  const distance = Math.min(
    height * 0.5,
    Math.max(0, height - marsCameraController.minimumZoomDistance)
  );
  if (distance > 0) viewer.camera.zoomIn(distance);
});
document.getElementById('globeZoomOut')?.addEventListener('click', () => {
  viewer.camera.zoomOut(viewer.camera.positionCartographic.height);
});
document.getElementById('globeHome')?.addEventListener('click', () => {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(77.42, 18.48, 7000000, MARS_ELLIPSOID),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration: 1
  });
});
let molaLegendVisible = true;

// Built-in fallback dataset & route calculator so the app works on ANY port, Live Server, or file:// without requiring a separate server restart
const FALLBACK_MARS_DATA = {
  mount_sharp: {
    site_name: "Mount Sharp (Gale Crater)",
    center: [-4.65, 137.40],
    base_habitat: {
      name: "Bradbury Base",
      coords: [-4.5895, 137.4417],
      elevation_m: -4450
    },
    unstudied_poi: {
      name: "Upper Sulfate-to-Clay Transition Mounds",
      coords: [-4.7200, 137.4800],
      elevation_m: -3800,
      scientific_objective: "Sample untouched sulfate layers for climate transition analysis"
    },
    hazards: [
      {
        name: "Gediz Vallis Scarp",
        type: "STEEP_SLOPE",
        danger_level: "CRITICAL",
        slope_deg: 28,
        coords: [-4.6700, 137.4500],
        radius_meters: 450
      }
    ],
    telemetry: {
      surface_temp_c: -65,
      radiation_rate_msv_day: 0.24,
      atmospheric_pressure_pa: 750,
      safe_eva_window_hours: 5.5
    },
    safe_route: [
      [-4.5895, 137.4417],
      [-4.6200, 137.4350],
      [-4.6550, 137.4450],
      [-4.6900, 137.4650],
      [-4.7200, 137.4800]
    ]
  },
  jezero_crater: {
    site_name: "Jezero Crater (Neretva Vallis)",
    center: [18.38, 77.58],
    base_habitat: {
      name: "Octavia E. Butler Base",
      coords: [18.4447, 77.4508],
      elevation_m: -2530
    },
    unstudied_poi: {
      name: "Upstream Neretva Vallis Canyon",
      coords: [18.5200, 77.3500],
      elevation_m: -2300,
      scientific_objective: "Inspect deep canyon bedrock for ancient hydrothermal minerals"
    },
    hazards: [
      {
        name: "Canyon Sand Trap & Choke Point",
        type: "BOULDER_AND_SLOPE",
        danger_level: "WARNING",
        slope_deg: 22,
        coords: [18.4800, 77.4000],
        radius_meters: 600
      }
    ],
    telemetry: {
      surface_temp_c: -58,
      radiation_rate_msv_day: 0.21,
      atmospheric_pressure_pa: 820,
      safe_eva_window_hours: 6.0
    },
    safe_route: [
      [18.4447, 77.4508],
      [18.4650, 77.4300],
      [18.4950, 77.3850],
      [18.5200, 77.3500]
    ]
  }
};

// State for Google Maps-style navigation & travel modes
let activeTravelSpeedKmH = 2.2;
let activeTravelMode = 'suit';
let currentRouteLine = null;
let currentWaypoints = [];
let currentRouteEndpoints = { departure: null, arrival: null };
let terrainNavigationResult = null;
let terrainRouteRequestId = 0;
let endpointSiteKey = null;
let currentSiteDetails = null;
let loadedNASAPlaces = [];
let selectedNASAEndpointLocations = { departure: null, arrival: null };
let customEndpointLocations = { departure: null, arrival: null };
let mapPickMode = null;
let navAnimationTimer = null;
let navMarker = null;

function clearTerrainNavigationRoute() {
  terrainRouteRequestId += 1;
  terrainRouteLayerGroup.clearLayers();
  if (calculateTerrainRouteBtn) calculateTerrainRouteBtn.disabled = false;
  terrainNavigationResult = null;
  const results = document.getElementById('terrainRouteResults');
  if (results) results.hidden = true;
  const stats = document.getElementById('terrainRouteStats');
  if (stats) stats.textContent = '';
  const confidence = document.getElementById('terrainRouteConfidence');
  if (confidence) confidence.textContent = '';
}

function getRouteLocations(siteData) {
  const waypoints = siteData.safe_route || [];
  const routeLocations = waypoints.map((coords, index) => {
    const isDeparture = index === 0;
    const isArrival = index === waypoints.length - 1;
    return {
      id: isDeparture ? 'base' : isArrival ? 'target' : `waypoint-${index + 1}`,
      name: isDeparture
        ? siteData.base_habitat?.name || 'Habitat Base'
        : isArrival
        ? siteData.unstudied_poi?.name || 'Mission Target'
        : `Waypoint ${index + 1}`,
      coords,
      routeIndex: index
    };
  });

  const nasaPlaces = new Map(
    [...loadedNASAPlaces, ...Object.values(selectedNASAEndpointLocations).filter(Boolean)]
      .map((place) => [place.id, place])
  );
  const nasaLocations = Array.from(nasaPlaces.values()).map((place) => ({
    id: `place:${place.id}`,
    name: [
      place.name,
      place.featureType,
      place.sizeKm ? `${place.sizeKm.toFixed(1)} km` : '',
      Number.isFinite(place.elevationM) ? `${place.elevationM.toLocaleString()} m` : '',
      'NASA'
    ].filter(Boolean).join(' · '),
    coords: [place.latitude, place.longitude],
    elevationM: place.elevationM,
    place
  }));
  const customLocations = Object.values(customEndpointLocations)
    .filter(Boolean)
    .map((location) => ({
      ...location,
      name: Number.isFinite(location.elevationM)
        ? `${location.name} · ${location.elevationM.toLocaleString()} m MOLA`
        : location.name
    }));

  return [...routeLocations, ...nasaLocations, ...customLocations];
}

function populateRouteSelectors(siteData) {
  const departureSelect = document.getElementById('departureSelect');
  const arrivalSelect = document.getElementById('arrivalSelect');
  if (!departureSelect || !arrivalSelect) return [];
  const site = document.getElementById('siteSelect').value;
  const siteChanged = endpointSiteKey !== site;
  if (siteChanged) {
    customEndpointLocations = { departure: null, arrival: null };
    selectedNASAEndpointLocations = { departure: null, arrival: null };
    loadedNASAPlaces = [];
  }
  const locations = getRouteLocations(siteData);
  if (locations.length < 2) return locations;
  const previousDeparture = departureSelect.value;
  const previousArrival = arrivalSelect.value;
  const locationIds = new Set(locations.map((location) => location.id));

  [departureSelect, arrivalSelect].forEach((select) => {
    const groups = [
      {
        label: 'Saved mission route',
        locations: locations.filter((location) => Number.isInteger(location.routeIndex))
      },
      {
        label: 'NASA Mars Trek places in the current map area',
        locations: locations.filter((location) => location.place)
      },
      {
        label: 'Custom map points',
        locations: locations.filter((location) => location.custom)
      }
    ];

    select.replaceChildren(...groups
      .filter((group) => group.locations.length)
      .map((group) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.label;
        group.locations.forEach((location) => {
          const option = document.createElement('option');
          option.value = location.id;
          option.textContent = location.name;
          optgroup.append(option);
        });
        return optgroup;
      }));
  });

  departureSelect.value = !siteChanged && locationIds.has(previousDeparture)
    ? previousDeparture
    : locations[0].id;
  arrivalSelect.value = !siteChanged && locationIds.has(previousArrival)
    ? previousArrival
    : locations.find((location) => location.id === 'target')?.id ||
      locations[locations.length - 1].id;

  if (departureSelect.value === arrivalSelect.value) {
    arrivalSelect.value = locations.find((location) => location.id !== departureSelect.value).id;
  }

  endpointSiteKey = site;
  return locations;
}

function getRouteBetweenLocations(siteData, departure, arrival) {
  if (!departure || !arrival) {
    throw new Error('Choose both a start point and a destination.');
  }

  if (!Number.isInteger(departure.routeIndex) || !Number.isInteger(arrival.routeIndex)) {
    return [departure.coords, arrival.coords];
  }

  const safeRoute = siteData.safe_route || [];
  const step = departure.routeIndex < arrival.routeIndex ? 1 : -1;
  const route = [];

  for (let index = departure.routeIndex; ; index += step) {
    route.push(safeRoute[index]);
    if (index === arrival.routeIndex) break;
  }

  return route;
}

function calculateMarsDistance(coord1, coord2) {
  const R = 3389.5;
  const dLat = (coord2[0] - coord1[0]) * (Math.PI / 180);
  const dLon = (coord2[1] - coord1[1]) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(coord1[0] * (Math.PI / 180)) *
      Math.cos(coord2[0] * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearingCardinal(coord1, coord2) {
  const dLat = coord2[0] - coord1[0];
  const dLon = coord2[1] - coord1[1];
  const angle = (Math.atan2(dLon, dLat) * 180) / Math.PI;
  const deg = (angle + 360) % 360;
  const dirs = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  return dirs[Math.round(deg / 45) % 8];
}

function elevationColor(elevationM) {
  if (!Number.isFinite(elevationM)) return '#38bdf8';
  const elevationRange = Math.max(0, Math.min(1, (elevationM + 8500) / 30000));
  const hue = 215 - elevationRange * 205;
  return `hsl(${hue}, 85%, 58%)`;
}

function findLabelPlacement(point, width, occupied, viewport) {
  const placements = [
    { direction: 'right', left: point.x + 10, top: point.y - 13 },
    { direction: 'left', left: point.x - width - 10, top: point.y - 13 },
    { direction: 'top', left: point.x - width / 2, top: point.y - 30 },
    { direction: 'bottom', left: point.x - width / 2, top: point.y + 10 }
  ];

  for (const placement of placements) {
    const box = {
      left: placement.left,
      right: placement.left + width,
      top: placement.top,
      bottom: placement.top + 26
    };
    const insideMap =
      box.left >= 4 &&
      box.right <= viewport.x - 4 &&
      box.top >= 4 &&
      box.bottom <= viewport.y - 4;
    const overlaps = occupied.some(
      (other) =>
        box.left < other.right + 6 &&
        box.right + 6 > other.left &&
        box.top < other.bottom + 5 &&
        box.bottom + 5 > other.top
    );

    if (insideMap && !overlaps) return { ...placement, box };
  }

  return null;
}

function buildPlaceQueryUrl(layer, bounds) {
  const [west, south, east, north] = bounds;
  const url = new URL(
    `https://trek.nasa.gov/mars/trekarcgis/rest/services/${layer.path}/query`
  );
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
  return url;
}

function normalizeNASAPlace(feature, layer) {
  const attributes = feature.attributes || {};
  const geometry = feature.geometry || {};
  const name = String(
    attributes.clean_name || attributes.name || attributes.title || ''
  ).trim();
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

  const sourceUrl = String(attributes.link || '').trim();
  const diameterKm = Number(attributes.diameter);
  return {
    id: `${layer.path}:${name}:${latitude}:${longitude}`,
    name,
    latitude,
    longitude,
    featureType: String(
      attributes.type || attributes.template || attributes.level || ''
    ).trim(),
    category: String(attributes.category || '').trim(),
    sizeKm:
      Number.isFinite(diameterKm) && diameterKm > 0 ? diameterKm : null,
    description: String(attributes.desc_ || attributes.template || '')
      .replace(/&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, '&')
      .trim(),
    notes: String(attributes.notes || '').trim(),
    approvalDate: String(attributes.approvaldt || '').trim(),
    sourceUrl: /^https?:\/\/planetarynames\.wr\.usgs\.gov\//i.test(sourceUrl)
      ? sourceUrl.replace(/^http:/i, 'https:')
      : '',
    sourceName: layer.name
  };
}

async function fetchNASAPlacesDirectly(bounds, signal) {
  const results = await Promise.allSettled(
    NASA_PLACE_LAYERS.map(async (layer) => {
      const response = await fetch(buildPlaceQueryUrl(layer, bounds), { signal });
      if (!response.ok) {
        throw new Error(`${layer.name} returned HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message || 'NASA place query failed');
      }

      return (result.features || [])
        .map((feature) => normalizeNASAPlace(feature, layer))
        .filter(Boolean);
    })
  );
  const places = [];
  const warnings = [];
  const seen = new Set();

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      warnings.push(NASA_PLACE_LAYERS[index].name);
      return;
    }

    result.value.forEach((place) => {
      const key = `${place.name.toLowerCase()}:${place.latitude.toFixed(5)}:${place.longitude.toFixed(5)}`;
      if (!seen.has(key)) {
        seen.add(key);
        places.push(place);
      }
    });
  });

  if (places.length === 0 && warnings.length === NASA_PLACE_LAYERS.length) {
    throw new Error(`NASA place-name sources failed: ${warnings.join(', ')}`);
  }

  return { places, warnings };
}

async function fetchNASAPlaces(bounds, signal) {
  const apiUrls = [];
  const isLocalPage =
    window.location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

  if (window.location.protocol !== 'file:') {
    apiUrls.push(new URL('/api/places', window.location.origin));
  }

  if (isLocalPage) {
    const host =
      window.location.protocol === 'file:'
        ? 'localhost'
        : window.location.hostname;
    const ports = new Set([
      window.location.port,
      ...LOCAL_BACKEND_PORTS
    ]);
    for (const port of ports) {
      if (port) apiUrls.push(new URL(`/api/places`, `http://${host}:${port}`));
    }
  }

  let apiFailure = null;
  for (const apiUrl of apiUrls) {
    apiUrl.searchParams.set('bbox', bounds.join(','));
    try {
      const response = await fetch(apiUrl, { signal });
      if (response.ok) {
        const result = await response.json();
        if (result.success) return result;
        apiFailure = new Error(result.message || 'The place-name request failed.');
      } else {
        apiFailure = new Error(`Place-name API returned HTTP ${response.status}`);
      }
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      apiFailure = error;
    }
  }

  if (apiFailure) {
    console.warn('Using NASA Mars Trek directly:', apiFailure.message);
  }
  return fetchNASAPlacesDirectly(bounds, signal);
}

function addPlacePopupRow(container, label, value) {
  if (!value) return;
  const row = document.createElement('p');
  const name = document.createElement('strong');
  name.textContent = `${label}: `;
  row.append(name, document.createTextNode(value));
  container.append(row);
}

function createPlacePopup(place) {
  const popup = document.createElement('div');
  popup.className = 'mars-place-popup';
  const heading = document.createElement('h3');
  heading.textContent = place.name;
  popup.append(heading);

  addPlacePopupRow(popup, 'Feature type', place.featureType);
  addPlacePopupRow(popup, 'Category', place.category);
  addPlacePopupRow(
    popup,
    'Recorded size',
    place.sizeKm === null ? '' : `${place.sizeKm.toFixed(2)} km`
  );

  const latitudeDirection = place.latitude < 0 ? 'S' : 'N';
  const longitudeDirection = place.longitude < 0 ? 'W' : 'E';
  addPlacePopupRow(
    popup,
    'Coordinates',
    `${Math.abs(place.latitude).toFixed(4)}° ${latitudeDirection}, ${Math.abs(place.longitude).toFixed(4)}° ${longitudeDirection}`
  );
  addPlacePopupRow(
    popup,
    'MOLA elevation',
    Number.isFinite(place.elevationM)
      ? `${place.elevationM.toLocaleString()} m relative to Mars datum`
      : ''
  );
  addPlacePopupRow(popup, 'Description', place.description);
  addPlacePopupRow(popup, 'Notes', place.notes);
  addPlacePopupRow(popup, 'Approval date', place.approvalDate);

  const source = document.createElement('p');
  source.className = 'mars-place-source';
  source.textContent = `Source: ${place.sourceName} · NASA Mars Trek`;
  popup.append(source);

  if (place.sourceUrl) {
    const linkUrl = new URL(place.sourceUrl);
    if (
      linkUrl.protocol === 'https:' &&
      linkUrl.hostname === 'planetarynames.wr.usgs.gov'
    ) {
      const link = document.createElement('a');
      link.href = linkUrl.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open USGS planetary-name record';
      popup.append(link);
    }
  }

  if (!place.description) {
    addPlacePopupRow(
      popup,
      'About this information',
      'NASA Mars Trek does not provide an additional description for this feature.'
    );
  }

  return popup;
}

function createMapPopup(title, rows) {
  const popup = document.createElement('div');
  popup.className = 'mars-place-popup';
  const heading = document.createElement('h3');
  heading.textContent = title;
  popup.append(heading);
  rows.forEach(([label, value]) => addPlacePopupRow(popup, label, String(value)));
  return popup;
}

function createCuriosityWaypointPopup(waypoint) {
  const popup = createMapPopup(waypoint.name, [
    [
      'Coordinates',
      `${Math.abs(waypoint.latitude).toFixed(4)}° ${waypoint.latitude < 0 ? 'S' : 'N'}, ${Math.abs(waypoint.longitude).toFixed(4)}° ${waypoint.longitude < 0 ? 'W' : 'E'}`
    ],
    ['Data source', 'NASA Mars Trek Curiosity waypoint layer']
  ]);
  if (!waypoint.sourceUrl) return popup;

  const sourceUrl = new URL(waypoint.sourceUrl);
  if (
    sourceUrl.protocol !== 'https:' ||
    sourceUrl.hostname !== 'trek.nasa.gov' ||
    !sourceUrl.pathname.startsWith('/mars/jpl/assets/features/curiosity/')
  ) {
    return popup;
  }
  const link = document.createElement('a');
  link.href = sourceUrl.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open this Curiosity stop in NASA Mars Trek';
  popup.append(link);
  return popup;
}

function focusCuriosityWaypoint(waypoint) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      waypoint.longitude,
      waypoint.latitude,
      12000,
      MARS_ELLIPSOID
    ),
    orientation: {
      heading: viewer.camera.heading,
      pitch: -Math.PI / 2,
      roll: 0
    },
    duration: 1,
    complete: () => {
      showMapPopup(
        createCuriosityWaypointPopup(waypoint),
        new Cesium.Cartesian2(
          viewer.canvas.clientWidth / 2,
          viewer.canvas.clientHeight / 2
        )
      );
    }
  });
}

function populateCuriosityWaypointList(waypoints) {
  const details = document.getElementById('curiosityStopsDetails');
  const list = document.getElementById('curiosityWaypointList');
  if (!details || !list) return;

  list.replaceChildren();
  waypoints.forEach((waypoint) => {
    const button = document.createElement('button');
    const latitude = `${Math.abs(waypoint.latitude).toFixed(4)}° ${waypoint.latitude < 0 ? 'S' : 'N'}`;
    const longitude = `${Math.abs(waypoint.longitude).toFixed(4)}° ${waypoint.longitude < 0 ? 'W' : 'E'}`;
    button.type = 'button';
    button.textContent = `${waypoint.name} · ${latitude}, ${longitude}`;
    button.addEventListener('click', () => focusCuriosityWaypoint(waypoint));
    list.append(button);
  });
  details.hidden = waypoints.length === 0;
}

async function fetchCuriosityLayersFromApi() {
  const apiUrls = [];
  if (window.location.protocol !== 'file:') {
    apiUrls.push(new URL('/api/curiosity', window.location.origin));
  }
  if (
    window.location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  ) {
    const host =
      window.location.protocol === 'file:'
        ? 'localhost'
        : window.location.hostname;
    const ports = new Set([window.location.port, ...LOCAL_BACKEND_PORTS]);
    for (const port of ports) {
      if (port) apiUrls.push(new URL('/api/curiosity', `http://${host}:${port}`));
    }
  }

  const failures = [];
  for (const apiUrl of apiUrls) {
    try {
      const response = await fetch(apiUrl, {
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) {
        failures.push(`HTTP ${response.status} from ${apiUrl.origin}`);
        continue;
      }
      const result = await response.json();
      if (result.success && Array.isArray(result.traverse) && Array.isArray(result.waypoints)) {
        return result;
      }
      failures.push(result.message || `Invalid response from ${apiUrl.origin}`);
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
      failures.push(`${apiUrl.origin}: ${error.message}`);
    }
  }
  throw new Error(
    failures.length
      ? `NASA Curiosity data could not be loaded (${failures.join('; ')}).`
      : 'NASA Curiosity data is unavailable from this page.'
  );
}

async function loadCuriosityRoverData() {
  if (curiosityDataLoaded) return curiosityWaypointCount;
  if (!curiosityDataRequest) {
    curiosityDataRequest = (async () => {
      const data = await fetchCuriosityLayersFromApi();
      populateCuriosityWaypointList(data.waypoints);
      data.traverse.forEach((coordinates, pathIndex) => {
        const positions = coordinates.map(([longitude, latitude]) =>
          Cesium.Cartesian3.fromDegrees(longitude, latitude, 0, MARS_ELLIPSOID)
        );
        const entity = viewer.entities.add({
          polyline: {
            positions,
            width: 3,
            material: Cesium.Color.fromCssColorString('#33e0c1')
          }
        });
        entity.mapPopup = createMapPopup('Curiosity recorded traverse', [
          ['Path', `NASA Mars Trek Curiosity route segment ${pathIndex + 1}`],
          ['Data source', 'NASA Mars Trek curiosity_path layer'],
          ['Rover status', 'Recorded route, not a live position']
        ]);
        curiosityTraverseLayerGroup.addLayer(entity);
      });

      data.waypoints.forEach((waypoint) => {
        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            waypoint.longitude,
            waypoint.latitude,
            0,
            MARS_ELLIPSOID
          ),
          point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString('#ffcf5c'),
            outlineColor: Cesium.Color.fromCssColorString('#19202d'),
            outlineWidth: 2,
            disableDepthTestDistance: 0
          },
          label: {
            text: waypoint.name,
            font: '11px Roboto, sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#111827'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#101827').withAlpha(0.9),
            pixelOffset: new Cesium.Cartesian2(0, -13),
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            disableDepthTestDistance: 0
          }
        });
        entity.isCuriosityWaypoint = true;
        entity.mapPopup = createCuriosityWaypointPopup(waypoint);
        curiosityWaypointLayerGroup.addLayer(entity);
      });
      curiosityDataLoaded = true;
      curiosityWaypointCount = data.waypoints.length;
      return curiosityWaypointCount;
    })().finally(() => {
      curiosityDataRequest = null;
    });
  }
  return curiosityDataRequest;
}

function clearPlaceNameLayers() {
  placeNamesLayerGroup.clearLayers();
}

function renderNASAPlaces(places, bounds, warnings) {
  clearPlaceNameLayers();
  loadedNASAPlaces = places;
  const visiblePlaces = places.filter((place) =>
    place.latitude >= bounds[1] &&
    place.latitude <= bounds[3] &&
    place.longitude >= bounds[0] &&
    place.longitude <= bounds[2]
  );
  const zoom = map.getZoom();
  const labels =
    zoom < 4
      ? visiblePlaces.filter((place) => place.sourceName !== 'Official Mars nomenclature')
      : visiblePlaces;

  if (currentSiteDetails) populateRouteSelectors(currentSiteDetails);

  const selectedPlaces = new Set(
    Object.values(selectedNASAEndpointLocations)
      .filter(Boolean)
      .map((place) => place.id)
  );
  const candidates = [...labels].sort((a, b) => {
    const selectedDifference =
      Number(selectedPlaces.has(b.id)) - Number(selectedPlaces.has(a.id));
    if (selectedDifference) return selectedDifference;
    const elevationDifference =
      Number(Number.isFinite(b.elevationM)) - Number(Number.isFinite(a.elevationM));
    if (elevationDifference) return elevationDifference;
    return (b.elevationM ?? -Infinity) - (a.elevationM ?? -Infinity);
  });
  const maxLabels = zoom < 5 ? 45 : zoom < 7 ? 90 : 150;
  const occupiedLabelAreas = [];
  const mapSize = map.getSize();
  let visibleLabelCount = 0;

  candidates.forEach((place) => {
    if (visibleLabelCount >= maxLabels) return;
    const point = map.latLngToContainerPoint([place.latitude, place.longitude]);
    if (!point) return;
    const labelText = Number.isFinite(place.elevationM)
      ? `${place.name} · ${place.elevationM.toLocaleString()} m`
      : place.name;
    const labelWidth = Math.min(280, Math.max(60, labelText.length * 7));
    const placement = findLabelPlacement(
      point,
      labelWidth,
      occupiedLabelAreas,
      mapSize
    );
    if (!placement) return;

    occupiedLabelAreas.push(placement.box);
    const pixelOffsets = {
      right: new Cesium.Cartesian2(10, 0),
      left: new Cesium.Cartesian2(-10, 0),
      top: new Cesium.Cartesian2(0, -12),
      bottom: new Cesium.Cartesian2(0, 12)
    };
    const horizontalOrigins = {
      right: Cesium.HorizontalOrigin.LEFT,
      left: Cesium.HorizontalOrigin.RIGHT,
      top: Cesium.HorizontalOrigin.CENTER,
      bottom: Cesium.HorizontalOrigin.CENTER
    };
    const verticalOrigins = {
      right: Cesium.VerticalOrigin.CENTER,
      left: Cesium.VerticalOrigin.CENTER,
      top: Cesium.VerticalOrigin.BOTTOM,
      bottom: Cesium.VerticalOrigin.TOP
    };
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        place.longitude,
        place.latitude,
        0,
        MARS_ELLIPSOID
      ),
      point: {
        pixelSize: place.sourceName === 'Named regions' ? 6 : 8,
        color: Cesium.Color.fromCssColorString(elevationColor(place.elevationM)),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: 0
      },
      label: {
        text: labelText,
        font: '12px Roboto, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#111827'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#101827').withAlpha(0.88),
        pixelOffset: pixelOffsets[placement.direction],
        horizontalOrigin: horizontalOrigins[placement.direction],
        verticalOrigin: verticalOrigins[placement.direction],
        scaleByDistance: new Cesium.NearFarScalar(500000, 1, 3000000, 0.7),
        disableDepthTestDistance: 0
      }
    });
    entity.mapPopup = createPlacePopup(place);
    placeNamesLayerGroup.addLayer(entity);
    visibleLabelCount += 1;
  });

  const status = document.getElementById('placesStatus');
  if (status) {
    const countText = `${places.length} NASA places in selection · ${visibleLabelCount} labels shown`;
    status.textContent = warnings.length
      ? `${countText} · some NASA layers unavailable`
      : countText;
  }
}

async function refreshNASAPlaceNames() {
  if (!placeNamesEnabled) return;

  if (map.getZoom() < 3.2) {
    clearPlaceNameLayers();
    const status = document.getElementById('placesStatus');
    if (status) status.textContent = 'Zoom in to load NASA named features';
    return;
  }

  const bounds = map.getBounds();
  const safeBounds = [
    Math.max(-180, bounds.getWest()),
    Math.max(-90, bounds.getSouth()),
    Math.min(180, bounds.getEast()),
    Math.min(90, bounds.getNorth())
  ].map((value) => Number(value.toFixed(5)));
  if (safeBounds[0] >= safeBounds[2] || safeBounds[1] >= safeBounds[3]) return;

  const boundsKey = `${map.getZoom()}:${safeBounds.join(',')}`;
  if (boundsKey === lastPlaceNamesBounds) return;
  lastPlaceNamesBounds = boundsKey;

  if (placeNamesRequest) placeNamesRequest.abort();
  placeNamesRequest = new AbortController();
  const status = document.getElementById('placesStatus');
  if (status) status.textContent = 'Loading NASA place names...';

  try {
    const result = await fetchNASAPlaces(safeBounds, placeNamesRequest.signal);
    if (placeNamesRequest.signal.aborted) return;
    renderNASAPlaces(result.places || [], safeBounds, result.warnings || []);
    if ((result.warnings || []).length) {
      console.warn('Some NASA Mars place-name layers could not be loaded:', result.warnings);
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    lastPlaceNamesBounds = '';
    if (status) {
      status.textContent =
        window.location.protocol === 'file:'
          ? 'Place names unavailable · open the app with npm start'
          : 'NASA place names temporarily unavailable';
    }
    console.error('Unable to load NASA Mars place names:', error);
  }
}

function scheduleNASAPlaceNameRefresh() {
  clearTimeout(placeNamesRefreshTimer);
  placeNamesRefreshTimer = setTimeout(refreshNASAPlaceNames, 250);
}

function updateMapPickControls() {
  const status = document.getElementById('mapPickStatus');
  const departureButton = document.getElementById('pickDepartureBtn');
  const arrivalButton = document.getElementById('pickArrivalBtn');
  const isPickingDeparture = mapPickMode === 'departure';
  const isPickingArrival = mapPickMode === 'arrival';

  departureButton?.classList.toggle('active', isPickingDeparture);
  arrivalButton?.classList.toggle('active', isPickingArrival);
  map.getContainer().classList.toggle('map-picking-point', Boolean(mapPickMode));
  if (status) {
    status.textContent = isPickingDeparture
      ? 'Click the map to set your custom starting point. Press Escape to cancel.'
      : isPickingArrival
      ? 'Click the map to set your custom destination. Press Escape to cancel.'
      : '';
  }
}

function beginMapPointSelection(endpoint) {
  mapPickMode = endpoint;
  updateMapPickControls();
}

function cancelMapPointSelection() {
  if (!mapPickMode) return;
  mapPickMode = null;
  updateMapPickControls();
}

function syncCoordinateInputs(departure, arrival) {
  const locations = [
    ['departure', departure],
    ['arrival', arrival]
  ];
  locations.forEach(([endpoint, location]) => {
    if (!location) return;
    document.getElementById(`${endpoint}Latitude`).value = location.coords[0];
    document.getElementById(`${endpoint}Longitude`).value = location.coords[1];
  });
}

async function sampleNASAElevation(latitude, longitude) {
  const urls = [];
  if (window.location.protocol !== 'file:') {
    urls.push(new URL('/api/elevation', window.location.origin));
  }

  const isLocalPage =
    window.location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  if (isLocalPage) {
    const host =
      window.location.protocol === 'file:'
        ? 'localhost'
        : window.location.hostname;
    const ports = new Set([window.location.port, ...LOCAL_BACKEND_PORTS]);
    for (const port of ports) {
      if (port) urls.push(new URL('/api/elevation', `http://${host}:${port}`));
    }
  }

  for (const url of urls) {
    url.searchParams.set('points', `${latitude},${longitude}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) continue;
      const result = await response.json();
      const elevationM = result.elevations?.[0]?.elevation_m;
      if (result.success && Number.isFinite(elevationM)) return elevationM;
    } catch (error) {
      console.warn('NASA elevation lookup failed:', error.message);
    }
  }
  return null;
}

async function setCustomEndpoint(endpoint, latitude, longitude) {
  const coordinateStatus = document.getElementById('coordinateStatus');
  if (coordinateStatus) coordinateStatus.textContent = 'Looking up NASA MOLA elevation...';
  const elevationM = await sampleNASAElevation(latitude, longitude);
  const pointName = `Custom point (${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°)`;
  const location = {
    id: `custom-${endpoint}`,
    name: pointName,
    coords: [latitude, longitude],
    elevationM,
    custom: true
  };

  if (!Number.isFinite(elevationM) && coordinateStatus) {
    coordinateStatus.textContent = 'Point saved; NASA MOLA elevation is unavailable.';
  }
  customEndpointLocations[endpoint] = location;
  selectedNASAEndpointLocations[endpoint] = null;
  cancelMapPointSelection();
  populateRouteSelectors(currentSiteDetails);
  document.getElementById(`${endpoint}Select`).value = location.id;
  syncCoordinateInputs(
    endpoint === 'departure' ? location : null,
    endpoint === 'arrival' ? location : null
  );
  if (Number.isFinite(elevationM) && coordinateStatus) {
    coordinateStatus.textContent = `NASA MOLA elevation: ${elevationM.toLocaleString()} m relative to Mars datum.`;
  }
  loadMissionRoute();
}

function selectCustomMapPoint(latlng) {
  if (!mapPickMode || !currentSiteDetails) return;

  const endpoint = mapPickMode;
  const latitude = Number(latlng.lat.toFixed(5));
  const longitude = Number(latlng.lng.toFixed(5));
  setCustomEndpoint(endpoint, latitude, longitude);
}

function handleCoordinateFormSubmit(event, endpoint) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;

  const latitude = form.elements.latitude.valueAsNumber;
  const longitude = form.elements.longitude.valueAsNumber;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    form.reportValidity();
    return;
  }

  cancelMapPointSelection();
  setCustomEndpoint(endpoint, Number(latitude.toFixed(5)), Number(longitude.toFixed(5)));
}

function buildPlanFromSiteData(siteData, routeWaypoints = siteData.safe_route || []) {
  const waypoints = routeWaypoints;
  let dist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    dist += calculateMarsDistance(waypoints[i], waypoints[i + 1]);
  }
  const walkHours = dist / activeTravelSpeedKmH;
  const scienceTime = activeTravelMode === 'drone' ? 0.25 : 1.5;
  const totalHours = walkHours + scienceTime;
  const o2Rate = activeTravelMode === 'suit' ? 6.5 : activeTravelMode === 'rover' ? 3.2 : 0;
  const battRate = activeTravelMode === 'suit' ? 8.0 : activeTravelMode === 'rover' ? 11.5 : 18.0;

  return {
    mission_status: "GO_FOR_EVA",
    total_distance_km: Number(dist.toFixed(2)),
    total_duration_hours: Number(totalHours.toFixed(2)),
    waypoints: waypoints,
    o2_consumed_pct: Math.min(100, Math.round(totalHours * o2Rate)),
    battery_consumed_pct: Math.min(100, Math.round(totalHours * battRate)),
    hazards_avoided: siteData.hazards || [],
    site_details: siteData
  };
}

let eventSource = null;

function connectLiveReload() {
  if (eventSource || typeof EventSource === 'undefined' || window.location.protocol === 'file:') {
    return;
  }
  try {
    eventSource = new EventSource('/api/events');
    let initialized = false;
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'connected') {
          if (initialized) loadMissionRoute();
          initialized = true;
        } else if (payload.type === 'reload') {
          if (payload.reason === 'data-reload') {
            loadMissionRoute();
          } else {
            window.location.reload();
          }
        }
      } catch (_) {}
    };
    eventSource.onerror = () => {
      eventSource.close();
      eventSource = null;
    };
  } catch (_) {}
}

// Fetch route from current dynamic port (Express API -> static marsData.json -> built-in dataset)
async function getMissionPlan(site) {
  const key = site.toLowerCase();
  const siteMetadata = FALLBACK_MARS_DATA[key] || null;

  // 1. Try same-origin API on whatever port the user's PC is currently running
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    try {
      const apiRes = await fetch(`/api/route/${key}`);
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json && json.success && json.plan) {
          connectLiveReload();
          const plan = json.plan;
          plan.site_details = siteMetadata;
          // Adjust if user switched to Rover or Scout mode
          if (activeTravelMode !== 'suit' && siteMetadata) {
            return buildPlanFromSiteData(siteMetadata);
          }
          return plan;
        }
      }
    } catch (_) {
      // Fall back to static JSON or embedded data on the current port
    }

    // 2. Try loading ../backend/Data/marsData.json directly from the current web server port
    const jsonPaths = ['../backend/Data/marsData.json', '/backend/Data/marsData.json'];
    for (const pathUrl of jsonPaths) {
      try {
        const dataRes = await fetch(pathUrl, { cache: 'no-store' });
        if (dataRes.ok) {
          const allData = await dataRes.json();
          if (allData && allData[key]) {
            return buildPlanFromSiteData(allData[key]);
          }
        }
      } catch (_) {}
    }
  }

  // 3. Always succeed using built-in dataset (works even on file:// or isolated frontend server)
  if (siteMetadata) {
    return buildPlanFromSiteData(siteMetadata);
  }

  throw new Error(`Unknown mission site: ${site}`);
}

function renderTurnByTurnSteps(waypoints, siteDetails, routeEndpoints) {
  const stepsBox = document.getElementById('stepsList');
  if (!stepsBox || !waypoints || waypoints.length === 0) return;

  const baseName = routeEndpoints?.departure?.name || siteDetails?.base_habitat?.name || 'Habitat Base';
  const targetName = routeEndpoints?.arrival?.name || siteDetails?.unstudied_poi?.name || 'Science Target POI';

  const itemsHtml = waypoints.map((coord, idx) => {
    if (idx === 0) {
      return `
        <div class="step-item" data-step-index="${idx}">
          <div class="step-icon">🏠</div>
          <div class="step-details">
            <div class="step-title">Depart ${baseName}</div>
            <div class="step-meta">${coord[0].toFixed(4)}° N, ${coord[1].toFixed(4)}° E</div>
          </div>
        </div>
      `;
    }
    const prev = waypoints[idx - 1];
    const segDist = calculateMarsDistance(prev, coord).toFixed(2);
    const dir = calculateBearingCardinal(prev, coord);
    const isLast = idx === waypoints.length - 1;

    return `
      <div class="step-item" data-step-index="${idx}">
        <div class="step-icon">${isLast ? '🏁' : '↗️'}</div>
        <div class="step-details">
          <div class="step-title">${isLast ? `Arrive at ${targetName}` : `Head ${dir} to Waypoint ${idx + 1}`}</div>
          <div class="step-meta">${segDist} km • [${coord[0].toFixed(4)}°, ${coord[1].toFixed(4)}°]</div>
        </div>
      </div>
    `;
  }).join('');

  stepsBox.innerHTML = itemsHtml;

  stepsBox.querySelectorAll('.step-item').forEach((el) => {
    el.addEventListener('click', () => {
      const i = Number(el.getAttribute('data-step-index'));
      if (waypoints[i]) {
        map.flyTo(waypoints[i], 9, { duration: 0.8 });
      }
    });
  });
}

// Route Loader & Telemetry
async function loadMissionRoute() {
  stopNavigationSimulation();
  clearTerrainNavigationRoute();
  const site = document.getElementById('siteSelect').value;
  try {
    const loadedPlan = await getMissionPlan(site);
    const details = loadedPlan.site_details || FALLBACK_MARS_DATA[site.toLowerCase()];
    currentSiteDetails = details;
    const routeLocations = populateRouteSelectors(details);
    const departure = routeLocations.find((location) => location.id === document.getElementById('departureSelect').value);
    const arrival = routeLocations.find((location) => location.id === document.getElementById('arrivalSelect').value);
    syncCoordinateInputs(departure, arrival);
    const coordinateStatus = document.getElementById('coordinateStatus');
    const endpointElevations = [departure, arrival]
      .map((location, index) => {
        if (!Number.isFinite(location?.elevationM)) return null;
        const label = location.custom
          ? index === 0
            ? 'Custom start'
            : 'Custom destination'
          : location.name;
        return `${label}: ${location.elevationM.toLocaleString()} m`;
      })
      .filter(Boolean);
    if (coordinateStatus && endpointElevations.length) {
      coordinateStatus.textContent = `NASA MOLA elevation · ${endpointElevations.join(' · ')}`;
    }
    const usesSavedRoute =
      Number.isInteger(departure?.routeIndex) &&
      Number.isInteger(arrival?.routeIndex);
    const waypoints = getRouteBetweenLocations(details, departure, arrival);
    const plan = buildPlanFromSiteData(details, waypoints);
    currentRouteEndpoints = { departure, arrival };

    hazardLayerGroup.clearLayers();
    routeLayerGroup.clearLayers();
    poiLayerGroup.clearLayers();

    const o2Remaining = 100 - plan.o2_consumed_pct;
    const battRemaining = 100 - plan.battery_consumed_pct;

    // Update Telemetry Panel
    document.getElementById('missionStatus').innerText = plan.mission_status;
    const navbarMissionStatus = document.getElementById('navbarMissionStatus');
    const navbarSiteName = document.getElementById('navbarSiteName');
    if (navbarMissionStatus) navbarMissionStatus.innerText = plan.mission_status.replaceAll('_', ' ');
    if (navbarSiteName) navbarSiteName.innerText = details.site_name || site;
    document.getElementById('distVal').innerText = plan.total_distance_km;
    document.getElementById('timeVal').innerText = plan.total_duration_hours;
    document.getElementById('routeMetaDesc').innerText = usesSavedRoute
      ? 'Saved mission route through planned waypoints'
      : 'Direct point-to-point estimate; terrain and hazards are not automatically routed';
    document.getElementById('o2Val').innerText = o2Remaining;
    document.getElementById('battVal').innerText = battRemaining;

    // Update Progress Bars
    const o2Bar = document.getElementById('o2Bar');
    const battBar = document.getElementById('battBar');
    if (o2Bar) o2Bar.style.width = `${o2Remaining}%`;
    if (battBar) battBar.style.width = `${battRemaining}%`;

    if (details) {
      if (details.telemetry) {
        const tempEl = document.getElementById('tempVal');
        const pressEl = document.getElementById('pressureVal');
        const radEl = document.getElementById('radVal');
        if (tempEl) tempEl.innerText = `${details.telemetry.surface_temp_c}°C`;
        if (pressEl) pressEl.innerText = `${details.telemetry.atmospheric_pressure_pa} Pa`;
        if (radEl) radEl.innerText = `${details.telemetry.radiation_rate_msv_day} mSv/d`;
      }
    }

    // Sidebar Hazards (Google Maps Traffic Advisory Cards)
    const hazardBox = document.getElementById('hazardList');
    if (plan.hazards_avoided && plan.hazards_avoided.length > 0) {
      hazardBox.innerHTML = plan.hazards_avoided.map((h, i) => `
        <div class="hazard-item" data-hazard-index="${i}">
          <div class="hazard-item-header">
            <span>⚠️ ${h.name}</span>
            <span>${h.slope_deg}&deg; Slope</span>
          </div>
          <div class="hazard-item-meta">Type: ${h.type} • ${usesSavedRoute ? 'Saved mission route advisory' : 'Nearby hazard; custom route is not automatically checked'}</div>
        </div>
      `).join('');

      hazardBox.querySelectorAll('.hazard-item').forEach((item) => {
        item.addEventListener('click', () => {
          const idx = Number(item.getAttribute('data-hazard-index'));
          const h = plan.hazards_avoided[idx];
          if (h && h.coords) {
            map.flyTo(h.coords, 9, { duration: 0.8 });
          }
        });
      });
    } else {
      hazardBox.innerHTML = 'No active hazards on this route.';
    }

    // 1. Hazards on Map
    plan.hazards_avoided.forEach((hazard) => {
      const position = Cesium.Cartesian3.fromDegrees(
        hazard.coords[1],
        hazard.coords[0],
        0,
        MARS_ELLIPSOID
      );
      const hazardCircle = viewer.entities.add({
        position,
        ellipse: {
          semiMajorAxis: hazard.radius_meters || 600,
          semiMinorAxis: hazard.radius_meters || 600,
          height: 0,
          material: Cesium.Color.fromCssColorString('#ea4335').withAlpha(0.35),
          outline: false
        }
      });
      hazardCircle.mapPopup = createMapPopup(`Hazard zone: ${hazard.name}`, [
        ['Type', hazard.type],
        ['Slope gradient', `${hazard.slope_deg}°`],
        [
          'Route advisory',
          usesSavedRoute
            ? 'The saved mission route is planned around terrain hazards.'
            : 'Direct custom routes are not checked or rerouted around terrain hazards.'
        ]
      ]);
      hazardLayerGroup.addLayer(hazardCircle);
    });

    // Draw the route as a geodesic line draped over the Mars sphere.
    currentWaypoints = waypoints;
    const routePositions = Cesium.Cartesian3.fromDegreesArray(
      waypoints.flatMap(([latitude, longitude]) => [longitude, latitude]),
      MARS_ELLIPSOID
    );
    const routeGlow = viewer.entities.add({
      polyline: {
        positions: routePositions,
        width: 10,
        material: Cesium.Color.fromCssColorString('#1d4ed8').withAlpha(0.45),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: true
      }
    });
    const routeLine = viewer.entities.add({
      polyline: {
        positions: routePositions,
        width: 5,
        material: Cesium.Color.fromCssColorString('#60a5fa'),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: true
      }
    });
    routeLine.getBounds = () => ({ points: waypoints });
    currentRouteLine = routeLine;
    routeLayerGroup.addLayer(routeGlow);
    routeLayerGroup.addLayer(routeLine);

    // Mark route endpoints and intermediate waypoints directly on the globe.
    waypoints.forEach((coord, idx) => {
      let markerText = String(idx + 1);
      let markerColor = '#60a5fa';
      let popup;

      if (idx === 0) {
        markerText = 'A';
        markerColor = '#3b82f6';
        popup = createMapPopup(`Origin: ${departure.name}`, [
          ['Route point', 'Selected departure point; EVA route begins here.']
        ]);
      } else if (idx === waypoints.length - 1) {
        markerText = 'B';
        markerColor = '#ef4444';
        popup = createMapPopup(`Arrival: ${arrival.name}`, [
          [
            'Objective',
            arrival.id === 'target'
              ? details?.unstudied_poi?.scientific_objective || 'High Priority EVA Objective'
              : 'Selected EVA route waypoint'
          ]
        ]);
      } else {
        popup = createMapPopup(`Waypoint ${idx + 1}`, [
          ['Latitude', `${coord[0].toFixed(4)}°`],
          ['Longitude', `${coord[1].toFixed(4)}°`]
        ]);
      }

      const marker = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          coord[1],
          coord[0],
          1200,
          MARS_ELLIPSOID
        ),
        point: {
          pixelSize: idx === 0 || idx === waypoints.length - 1 ? 15 : 10,
          color: Cesium.Color.fromCssColorString(markerColor),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2
        },
        label: {
          text: markerText,
          font: '500 12px Roboto, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString('#111827'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: 0
        }
      });
      marker.mapPopup = popup;
      poiLayerGroup.addLayer(marker);
    });

    renderTurnByTurnSteps(waypoints, details, currentRouteEndpoints);
    if (currentAppView === 'planner') {
      map.fitBounds(routeLine.getBounds());
    }
    applyMapLayersForView(currentAppView);

  } catch (err) {
    console.error(err);
  }
}

// Live Turn-by-Turn EVA Navigation Simulation (Google Maps "Start" Mode)
function stopNavigationSimulation() {
  if (navAnimationTimer) {
    clearInterval(navAnimationTimer);
    navAnimationTimer = null;
  }
  if (navMarker) {
    poiLayerGroup.removeLayer(navMarker);
    navMarker = null;
  }
  const banner = document.getElementById('navBanner');
  if (banner) banner.classList.add('hidden');
  const startBtn = document.getElementById('startNavBtn');
  if (startBtn) {
    startBtn.classList.remove('active');
    startBtn.innerHTML = '<span>▶</span> Start EVA Navigation';
  }
}

function startNavigationSimulation() {
  if (navAnimationTimer) {
    stopNavigationSimulation();
    return;
  }
  if (!currentWaypoints || currentWaypoints.length < 2) return;

  const banner = document.getElementById('navBanner');
  const navInstruction = document.getElementById('navInstruction');
  const navSubtext = document.getElementById('navSubtext');
  const startBtn = document.getElementById('startNavBtn');

  if (banner) banner.classList.remove('hidden');
  if (startBtn) {
    startBtn.classList.add('active');
    startBtn.innerHTML = '<span>⏹</span> Stop Navigation';
  }

  const modeEmoji = activeTravelMode === 'rover' ? '🛞' : activeTravelMode === 'drone' ? '🚁' : '🧑‍🚀';
  navMarker = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(
      currentWaypoints[0][1],
      currentWaypoints[0][0],
      1200,
      MARS_ELLIPSOID
    ),
    label: {
      text: modeEmoji,
      font: '24px sans-serif',
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: 0
    }
  });
  poiLayerGroup.addLayer(navMarker);

  // Build interpolated points across segments
  const interpolated = [];
  for (let i = 0; i < currentWaypoints.length - 1; i++) {
    const start = currentWaypoints[i];
    const end = currentWaypoints[i + 1];
    const dir = calculateBearingCardinal(start, end);
    const segDist = calculateMarsDistance(start, end).toFixed(2);
    const steps = 25;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      interpolated.push({
        coord: [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t],
        segmentIndex: i + 1,
        dir,
        segDist
      });
    }
  }

  let tick = 0;
  navAnimationTimer = setInterval(() => {
    if (tick >= interpolated.length) {
      if (navInstruction) navInstruction.innerText = `Arrived at ${currentRouteEndpoints.arrival?.name || 'your destination'}`;
      if (navSubtext) navSubtext.innerText = 'EVA Navigation Complete • Route destination reached';
      clearInterval(navAnimationTimer);
      navAnimationTimer = null;
      return;
    }
    const pt = interpolated[tick];
    navMarker.position = Cesium.Cartesian3.fromDegrees(
      pt.coord[1],
      pt.coord[0],
      1200,
      MARS_ELLIPSOID
    );
    if (navInstruction) {
      navInstruction.innerText = `Proceed ${pt.dir} toward Waypoint ${pt.segmentIndex + 1}`;
    }
    if (navSubtext) {
      navSubtext.innerText = `Segment distance: ${pt.segDist} km • Lat ${pt.coord[0].toFixed(4)}°, Lon ${pt.coord[1].toFixed(4)}°`;
    }
    tick++;
  }, 120);
}

// UI Event Listeners
document.getElementById('loadBtn').addEventListener('click', loadMissionRoute);
document.getElementById('siteSelect').addEventListener('change', () => {
  cancelMapPointSelection();
  loadMissionRoute();
});

function handleEndpointSelectionChange(changedId, otherId) {
  const changedSelect = document.getElementById(changedId);
  const otherSelect = document.getElementById(otherId);
  const endpoint = changedId === 'departureSelect' ? 'departure' : 'arrival';
  cancelMapPointSelection();

  if (currentSiteDetails) {
    const selectedLocation = getRouteLocations(currentSiteDetails)
      .find((location) => location.id === changedSelect.value);
    selectedNASAEndpointLocations[endpoint] = selectedLocation?.place || null;
    customEndpointLocations[endpoint] = selectedLocation?.custom
      ? selectedLocation
      : null;
    populateRouteSelectors(currentSiteDetails);
  }

  if (changedSelect.value === otherSelect.value) {
    const alternative = Array.from(otherSelect.options).find((option) => option.value !== changedSelect.value);
    if (alternative) otherSelect.value = alternative.value;
  }
  loadMissionRoute();
}

document.getElementById('departureSelect').addEventListener('change', () => {
  handleEndpointSelectionChange('departureSelect', 'arrivalSelect');
});
document.getElementById('arrivalSelect').addEventListener('change', () => {
  handleEndpointSelectionChange('arrivalSelect', 'departureSelect');
});

document.getElementById('pickDepartureBtn').addEventListener('click', () => {
  beginMapPointSelection(mapPickMode === 'departure' ? null : 'departure');
});
document.getElementById('pickArrivalBtn').addEventListener('click', () => {
  beginMapPointSelection(mapPickMode === 'arrival' ? null : 'arrival');
});
document.getElementById('departureCoordinateForm').addEventListener('submit', (event) => {
  handleCoordinateFormSubmit(event, 'departure');
});
document.getElementById('arrivalCoordinateForm').addEventListener('submit', (event) => {
  handleCoordinateFormSubmit(event, 'arrival');
});
map.on('click', (event) => selectCustomMapPoint(event.latlng));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') cancelMapPointSelection();
});

const startNavBtn = document.getElementById('startNavBtn');
if (startNavBtn) startNavBtn.addEventListener('click', startNavigationSimulation);

const stopNavBtn = document.getElementById('stopNavBtn');
if (stopNavBtn) stopNavBtn.addEventListener('click', stopNavigationSimulation);

const recenterBtn = document.getElementById('recenterBtn');
if (recenterBtn) {
  recenterBtn.addEventListener('click', () => {
    if (currentRouteLine) {
      map.fitBounds(currentRouteLine.getBounds(), {
        paddingTopLeft: [420, 60],
        paddingBottomRight: [60, 60]
      });
    }
  });
}

function getTerrainRouteHazards() {
  return (currentSiteDetails?.hazards || [])
    .filter((hazard) =>
      Array.isArray(hazard.coords) &&
      hazard.coords.length === 2 &&
      Number.isFinite(hazard.coords[0]) &&
      Number.isFinite(hazard.coords[1])
    )
    .map((hazard) => ({
      name: hazard.name,
      type: hazard.type,
      center: {
        latitude: hazard.coords[0],
        longitude: hazard.coords[1]
      },
      radiusMeters: hazard.radius_meters || 0,
      bufferMeters: 350,
      restricted: true
    }));
}

async function fetchTerrainRoute(requestBody) {
  const apiUrls = [];
  if (window.location.protocol !== 'file:') {
    apiUrls.push(new URL('/api/navigation/terrain', window.location.origin));
  }
  if (
    window.location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  ) {
    const host =
      window.location.protocol === 'file:'
        ? 'localhost'
        : window.location.hostname;
    const ports = new Set([window.location.port, ...LOCAL_BACKEND_PORTS]);
    for (const port of ports) {
      if (port) apiUrls.push(new URL('/api/navigation/terrain', `http://${host}:${port}`));
    }
  }

  const uniqueApiUrls = [
    ...new Map(apiUrls.map((url) => [url.origin, url])).values()
  ];
  const backendUrls = [];
  for (const apiUrl of uniqueApiUrls) {
    try {
      const healthUrl = new URL('/api/health', apiUrl.origin);
      const response = await fetch(healthUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3000)
      });
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) continue;
      const health = await response.json();
      if (health.success && health.service === 'mars-navigator') {
        backendUrls.push(apiUrl);
      }
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        continue;
      }
    }
  }

  if (backendUrls.length === 0) {
    throw new Error(
      'Could not connect to the Mars Navigator backend. Start it from the project folder with `npm start`, then retry.'
    );
  }

  const failures = [];
  for (const url of backendUrls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120000)
      });
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        failures.push(
          `${url.origin}: backend returned an unreadable response (HTTP ${response.status}).`
        );
        continue;
      }
      if (response.ok && result.success && result.route) return result.route;
      const message =
        result.message || `Terrain route API returned HTTP ${response.status}.`;
      if (response.status >= 400 && response.status < 500 &&
          response.status !== 404) {
        throw new Error(message);
      }
      failures.push(`${url.origin}: ${message}`);
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
      if (error instanceof Error &&
          !failures.some((failure) => failure.startsWith(`${url.origin}:`))) {
        throw error;
      }
    }
  }

  throw new Error(
    failures.length
      ? `The terrain route service is unavailable (${failures.join('; ')}).`
      : 'The running Mars Navigator backend does not provide terrain routing. Restart it with `npm start` and retry.'
  );
}

function renderTerrainNavigationResult(route) {
  if (!Array.isArray(route.routeCoordinates) || route.routeCoordinates.length < 2) {
    throw new Error('The terrain service returned an invalid route geometry.');
  }
  terrainRouteLayerGroup.clearLayers();
  const routePositions = route.routeCoordinates.map((coordinate) =>
    Cesium.Cartesian3.fromDegrees(
      coordinate.longitude,
      coordinate.latitude,
      0,
      MARS_ELLIPSOID
    )
  );
  const routeEntity = viewer.entities.add({
    polyline: {
      positions: routePositions,
      width: 7,
      material: Cesium.Color.fromCssColorString('#f59e0b'),
      arcType: Cesium.ArcType.GEODESIC,
      clampToGround: true
    }
  });
  routeEntity.mapPopup = createMapPopup('Experimental MOLA terrain route', [
    ['Distance', `${route.totalDistanceKilometers.toFixed(2)} km`],
    ['Average slope', `${route.averageSlopeDegrees.toFixed(1)}°`],
    ['Maximum slope', `${route.maximumSlopeDegrees.toFixed(1)}°`],
    ['Confidence', 'Low; MOLA cannot resolve foot-scale hazards.']
  ]);
  terrainRouteLayerGroup.addLayer(routeEntity);

  [
    { coordinate: route.start, label: 'A', name: 'Terrain route start' },
    { coordinate: route.destination, label: 'B', name: 'Terrain route destination' }
  ].forEach(({ coordinate, label, name }) => {
    const marker = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        coordinate.longitude,
        coordinate.latitude,
        1200,
        MARS_ELLIPSOID
      ),
      point: {
        pixelSize: 13,
        color: Cesium.Color.fromCssColorString(
          label === 'A' ? '#22c55e' : '#ef4444'
        ),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2
      },
      label: {
        text: label,
        font: '500 12px Roboto, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#111827'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: 0
      }
    });
    marker.mapPopup = createMapPopup(name, [
      [
        'Coordinates',
        `${coordinate.latitude.toFixed(5)}°, ${coordinate.longitude.toFixed(5)}°`
      ],
      ['Route', 'Experimental NASA MOLA terrain-weighted route']
    ]);
    terrainRouteLayerGroup.addLayer(marker);
  });

  const routePoints = route.routeCoordinates.map((coordinate) => [
    coordinate.latitude,
    coordinate.longitude
  ]);
  routeEntity.getBounds = () => ({ points: routePoints });
  currentRouteLine = routeEntity;
  currentWaypoints = routePoints;
  terrainNavigationResult = route;

  const classCounts = route.terrainClassCounts;
  const terrainStats = [
    `Distance: ${route.totalDistanceKilometers.toFixed(2)} km`,
    `Average / maximum slope: ${route.averageSlopeDegrees.toFixed(1)}° / ${route.maximumSlopeDegrees.toFixed(1)}°`,
    `Route cells — preferred: ${classCounts.SAFE_CANDIDATE || 0}, caution: ${classCounts.CAUTION || 0}, high risk: ${classCounts.HIGH_RISK || 0}`,
    `Sampled area coverage: ${route.terrainCoveragePercent.toFixed(1)}%`,
    `Restricted cells excluded: ${route.restrictedCellsAvoided}; unknown cells blocked: ${route.unknownCellsBlocked}`,
    `Effort index: ${route.estimatedEffort.index.toFixed(2)} (relative, not a certified energy estimate)`
  ];
  const adjustedEndpoints = Object.entries(route.endpointAdjustments || {})
    .filter(([, distance]) => distance >= 1)
    .map(([endpoint, distance]) =>
      `${endpoint === 'startMeters' ? 'Start' : 'Destination'} moved ${distance.toFixed(0)} m to the nearest traversable terrain`
    );
  terrainStats.push(...adjustedEndpoints);
  const results = document.getElementById('terrainRouteResults');
  const stats = document.getElementById('terrainRouteStats');
  const confidence = document.getElementById('terrainRouteConfidence');
  if (results) results.hidden = false;
  if (stats) stats.textContent = terrainStats.join(' · ');
  if (confidence) {
    confidence.textContent =
      `LOW confidence · ${route.grid.resolutionMeters.toFixed(0)} m planning cells; ` +
      `MOLA source resolution is about ${route.confidence.sourceResolutionMeters?.toFixed(0) ?? 'unknown'} m. ` +
      route.confidence.reason;
  }

  document.getElementById('distVal').textContent =
    route.totalDistanceKilometers.toFixed(2);
  document.getElementById('timeVal').textContent = (
    route.totalDistanceKilometers / Math.max(activeTravelSpeedKmH, 0.1)
  ).toFixed(2);
  document.getElementById('routeMetaDesc').textContent =
    'Experimental terrain-weighted route · NASA MOLA';
  renderTurnByTurnSteps(routePoints, currentSiteDetails, currentRouteEndpoints);
  applyMapLayersForView(currentAppView);
  map.fitBounds(routeEntity.getBounds(), { duration: 0.8 });
}

const calculateTerrainRouteBtn = document.getElementById(
  'calculateTerrainRouteBtn'
);
calculateTerrainRouteBtn?.addEventListener('click', async () => {
  const status = document.getElementById('terrainRouteStatus');
  const departure = currentRouteEndpoints.departure;
  const arrival = currentRouteEndpoints.arrival;
  if (!departure?.coords || !arrival?.coords) {
    if (status) status.textContent = 'Select a start and destination before calculating a route.';
    return;
  }

  clearTerrainNavigationRoute();
  applyMapLayersForView(currentAppView);
  const requestId = ++terrainRouteRequestId;
  calculateTerrainRouteBtn.disabled = true;
  if (status) status.textContent = 'Sampling NASA MOLA elevations and searching for a lower-risk route…';
  try {
    const route = await fetchTerrainRoute({
      start: {
        latitude: departure.coords[0],
        longitude: departure.coords[1]
      },
      destination: {
        latitude: arrival.coords[0],
        longitude: arrival.coords[1]
      },
      resolutionMeters: Number(
        document.getElementById('terrainResolutionSelect').value
      ),
      hazards: getTerrainRouteHazards()
    });
    if (requestId !== terrainRouteRequestId) return;
    renderTerrainNavigationResult(route);
    if (status) {
      const adjustments = Object.values(route.endpointAdjustments || {})
        .filter((distance) => distance >= 1);
      const adjustmentMessage = adjustments.length
        ? ` · endpoint moved to traversable terrain (${adjustments.map((distance) => `${distance.toFixed(0)} m`).join(', ')})`
        : '';
      status.textContent =
        `Experimental route found · ${route.totalDistanceKilometers.toFixed(2)} km · low confidence${adjustmentMessage}`;
    }
  } catch (error) {
    if (requestId !== terrainRouteRequestId) return;
    if (status) status.textContent = error.message;
    console.error('Unable to calculate an experimental MOLA terrain route:', error);
  } finally {
    if (requestId === terrainRouteRequestId) {
      calculateTerrainRouteBtn.disabled = false;
    }
  }
});

// Travel Mode Tabs (Suit / Rover / Scout)
document.querySelectorAll('.mode-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeTravelMode = btn.getAttribute('data-mode') || 'suit';
    activeTravelSpeedKmH = Number(btn.getAttribute('data-speed')) || 2.2;
    loadMissionRoute();
  });
});

function setMapLayerVisible(layer, visible) {
  if (!layer) return;
  const isVisible = map.hasLayer(layer);
  if (visible && !isVisible) map.addLayer(layer);
  if (!visible && isVisible) map.removeLayer(layer);
}

function applyMapLayersForView(view = currentAppView) {
  const showRoute = true;
  const showTerrainRoute =
    showRoute && Boolean(terrainNavigationResult);
  const showSavedRoute = showRoute && !showTerrainRoute;
  const showHazards =
    view === 'hazards' || hazardsLayerEnabled;
  const showMola = molaLayerEnabled;
  const showPlaceNames = placeNamesEnabled;
  const showCuriosityImagery = curiosityImageryEnabled;
  const showCuriosityRover = curiosityRoverEnabled;
  const showInsightImagery = insightImageryEnabled;

  setMapLayerVisible(routeLayerGroup, showSavedRoute);
  setMapLayerVisible(poiLayerGroup, showSavedRoute);
  setMapLayerVisible(terrainRouteLayerGroup, showTerrainRoute);
  setMapLayerVisible(hazardLayerGroup, showHazards);
  setMapLayerVisible(molaElevationOverlay, showMola);
  setMapLayerVisible(placeNamesLayerGroup, showPlaceNames);
  setMapLayerVisible(curiosityHiRISEImagery, showCuriosityImagery);
  setMapLayerVisible(curiosityTraverseLayerGroup, showCuriosityRover);
  setMapLayerVisible(curiosityWaypointLayerGroup, showCuriosityRover);
  setMapLayerVisible(insightCTXImagery, showInsightImagery);

  if (showMola && !molaLegendVisible) {
    molaLegend.addTo(map);
    molaLegendVisible = true;
  } else if (!showMola && molaLegendVisible) {
    molaLegend.remove();
    molaLegendVisible = false;
  }
}

function updateLayerToggle(button, enabled) {
  button?.classList.toggle('active', enabled);
  button?.setAttribute('aria-pressed', String(enabled));
  const state = button?.querySelector('.sidebar-layer-state');
  if (state) state.textContent = enabled ? 'On' : 'Off';
}

// Map Layer Toggles
const toggleMolaBtn = document.getElementById('toggleMolaBtn');
if (toggleMolaBtn) {
  toggleMolaBtn.addEventListener('click', () => {
    molaLayerEnabled = !molaLayerEnabled;
    updateLayerToggle(toggleMolaBtn, molaLayerEnabled);
    applyMapLayersForView(currentAppView);
  });
}

const toggleHazardsBtn = document.getElementById('toggleHazardsBtn');
if (toggleHazardsBtn) {
  toggleHazardsBtn.addEventListener('click', () => {
    hazardsLayerEnabled = !hazardsLayerEnabled;
    updateLayerToggle(toggleHazardsBtn, hazardsLayerEnabled);
    applyMapLayersForView(currentAppView);
  });
}

const togglePlaceNamesBtn = document.getElementById('togglePlaceNamesBtn');
if (togglePlaceNamesBtn) {
  togglePlaceNamesBtn.addEventListener('click', () => {
    placeNamesEnabled = !placeNamesEnabled;
    document.body.dataset.placeNames = String(placeNamesEnabled);
    updateLayerToggle(togglePlaceNamesBtn, placeNamesEnabled);
    const status = document.getElementById('placesStatus');

    if (placeNamesEnabled) {
      lastPlaceNamesBounds = '';
      scheduleNASAPlaceNameRefresh();
    } else {
      if (placeNamesRequest) placeNamesRequest.abort();
      clearPlaceNameLayers();
      if (status) status.textContent = 'Place names hidden';
    }
    applyMapLayersForView(currentAppView);
  });
}

const toggleCuriosityImageryBtn = document.getElementById(
  'toggleCuriosityImageryBtn'
);
toggleCuriosityImageryBtn?.addEventListener('click', () => {
  curiosityImageryEnabled = !curiosityImageryEnabled;
  updateLayerToggle(toggleCuriosityImageryBtn, curiosityImageryEnabled);
  applyMapLayersForView(currentAppView);
});

const toggleCuriosityRoverBtn = document.getElementById(
  'toggleCuriosityRoverBtn'
);
toggleCuriosityRoverBtn?.addEventListener('click', async () => {
  curiosityRoverEnabled = !curiosityRoverEnabled;
  updateLayerToggle(toggleCuriosityRoverBtn, curiosityRoverEnabled);
  applyMapLayersForView(currentAppView);
  const status = document.getElementById('curiosityLayerStatus');

  if (!curiosityRoverEnabled) {
    if (status && !curiosityDataLoaded) status.textContent = '';
    return;
  }

  if (status) status.textContent = 'Loading Curiosity rover data from NASA Mars Trek…';
  try {
    const waypointCount = await loadCuriosityRoverData();
    if (status) {
      status.textContent = `NASA Mars Trek data loaded: recorded rover path and ${waypointCount} named stops.`;
    }
    applyMapLayersForView(currentAppView);
  } catch (error) {
    curiosityRoverEnabled = false;
    updateLayerToggle(toggleCuriosityRoverBtn, false);
    applyMapLayersForView(currentAppView);
    if (status) {
      status.textContent = 'Curiosity rover layers could not be loaded. Check your connection and try again.';
    }
    console.error('Unable to load NASA Mars Trek Curiosity rover layers:', error);
  }
});

const toggleInsightImageryBtn = document.getElementById(
  'toggleInsightImageryBtn'
);
toggleInsightImageryBtn?.addEventListener('click', () => {
  insightImageryEnabled = !insightImageryEnabled;
  updateLayerToggle(toggleInsightImageryBtn, insightImageryEnabled);
  applyMapLayersForView(currentAppView);
});

document.getElementById('focusCuriosityBtn')?.addEventListener('click', () => {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      137.4,
      -4.65,
      50000,
      MARS_ELLIPSOID
    ),
    orientation: {
      heading: viewer.camera.heading,
      pitch: -Math.PI / 2,
      roll: 0
    },
    duration: 1.2
  });
});

// Collapsible Sidebar Drawer Toggle
const sidebarToggle = document.getElementById('sidebarToggle');
const navSidebar = document.getElementById('navSidebar');
if (sidebarToggle && navSidebar) {
  sidebarToggle.addEventListener('click', () => {
    navigateToAppView(currentAppView === 'map' ? 'planner' : 'map');
  });
}

function setActiveAppView(view) {
  currentAppView = view;
  document.body.dataset.appView = view;
  document.querySelectorAll('.app-nav-link').forEach((button) => {
    const isActive = button.dataset.appView === view;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

const APP_VIEW_SECTIONS = {
  map: [],
  planner: ['routeSummarySection', 'routeStepsSection'],
  telemetry: ['telemetrySection'],
  layers: ['layerSection'],
  hazards: ['hazardSection']
};

function updateSidebarForView(view) {
  const sidebarHeader = navSidebar?.querySelector('.nav-sidebar-header');
  const sidebarBody = navSidebar?.querySelector('.nav-sidebar-body');
  const visibleSections = new Set(APP_VIEW_SECTIONS[view] || []);
  const isMapView = view === 'map';

  if (navSidebar) {
    navSidebar.classList.toggle('collapsed', isMapView);
  }
  if (sidebarHeader) sidebarHeader.hidden = view !== 'planner';
  if (sidebarBody) {
    Array.from(sidebarBody.children).forEach((section) => {
      section.hidden = !visibleSections.has(section.id);
    });
    sidebarBody.scrollTo({ top: 0, behavior: 'auto' });
  }
  if (sidebarToggle) {
    sidebarToggle.hidden = !['map', 'planner'].includes(view);
    sidebarToggle.innerText = isMapView ? '▶' : '◀';
  }
}

function showAppView(view) {
  if (!Object.prototype.hasOwnProperty.call(APP_VIEW_SECTIONS, view)) return;

  setActiveAppView(view);
  updateSidebarForView(view);

  if (view !== 'planner') {
    stopNavigationSimulation();
    cancelMapPointSelection();
  }

  applyMapLayersForView(view);

  if (placeNamesEnabled) {
    scheduleNASAPlaceNameRefresh();
  }

  map.invalidateSize();
}

function navigateToAppView(view) {
  showAppView(view);
}

document.querySelectorAll('button[data-app-view]').forEach((button) => {
  button.addEventListener('click', () => navigateToAppView(button.dataset.appView));
});

// Live Cursor Coordinates Tracker
const cursorCoords = document.getElementById('cursorCoords');
map.on('mousemove', (e) => {
  if (cursorCoords) {
    const ns = e.latlng.lat >= 0 ? 'N' : 'S';
    const ew = e.latlng.lng >= 0 ? 'E' : 'W';
    cursorCoords.innerText = `Mars Lat: ${Math.abs(e.latlng.lat).toFixed(4)}° ${ns}, Lon: ${Math.abs(e.latlng.lng).toFixed(4)}° ${ew}`;
  }
});

map.on('moveend zoomend', scheduleNASAPlaceNameRefresh);
updateLayerToggle(toggleMolaBtn, molaLayerEnabled);
updateLayerToggle(toggleHazardsBtn, hazardsLayerEnabled);
updateLayerToggle(togglePlaceNamesBtn, placeNamesEnabled);
updateLayerToggle(toggleCuriosityImageryBtn, curiosityImageryEnabled);
updateLayerToggle(toggleCuriosityRoverBtn, curiosityRoverEnabled);
updateLayerToggle(toggleInsightImageryBtn, insightImageryEnabled);
showAppView('planner');
scheduleNASAPlaceNameRefresh();
loadMissionRoute();
