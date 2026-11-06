// Map Initialization (Stable Web Mercator)
const map = L.map('map', {
  zoomControl: false,
  minZoom: 2,
  maxZoom: 9
}).setView([18.48, 77.42], 8);

L.control.zoom({ position: 'topright' }).addTo(map);

// 1. NASA Mars Trek Viking MDIM 2.1 global color mosaic
const MarsTrekImageLayer = L.GridLayer.extend({
  createTile: function (coords, done) {
    const tile = document.createElement('img');
    const tileSize = this.getTileSize();
    const northWest = map.unproject(
      L.point(coords.x * tileSize.x, coords.y * tileSize.y),
      coords.z
    );
    const southEast = map.unproject(
      L.point((coords.x + 1) * tileSize.x, (coords.y + 1) * tileSize.y),
      coords.z
    );
    const topLeft = map.options.crs.project(northWest);
    const bottomRight = map.options.crs.project(southEast);
    const url = new URL(
      'https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_Viking_MDIM21_ClrMosaic_global_232m/ImageServer/exportImage'
    );

    url.search = new URLSearchParams({
      bbox: `${topLeft.x},${bottomRight.y},${bottomRight.x},${topLeft.y}`,
      bboxSR: '3857',
      imageSR: '3857',
      size: `${tileSize.x},${tileSize.y}`,
      format: 'png',
      interpolation: 'RSP_Bilinear',
      f: 'image'
    }).toString();

    tile.alt = '';
    tile.setAttribute('role', 'presentation');
    tile.onload = function () {
      done(null, tile);
    };
    tile.onerror = function () {
      done(new Error('Failed to load a NASA Mars Trek map tile.'), tile);
    };
    tile.src = url.toString();
    return tile;
  }
});

const marsShadedRelief = new MarsTrekImageLayer({
  maxZoom: 9,
  minZoom: 2,
  attribution: '&copy; <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noopener noreferrer">NASA/JPL Mars Trek — Viking MDIM 2.1</a>'
}).addTo(map);

// 2. ASLI NASA MOLA COLOR ALTITUDE TOPOGRAPHY (PIA02820 Rainbow/Elevation Spectrum)
const molaElevationOverlay = L.tileLayer('https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-elevation-v0-1/all/{z}/{x}/{y}.png', {
  maxZoom: 9,
  minZoom: 2,
  opacity: 0.70,
  attribution: '&copy; NASA MGS MOLA Elevation Dataset'
});

// Layer Groups
const hazardLayerGroup = L.layerGroup().addTo(map);
const routeLayerGroup = L.layerGroup().addTo(map);
const poiLayerGroup = L.layerGroup().addTo(map);

// Multi-Layer Toggle Controls (Top Right)
const baseMaps = {
  "NASA Mars Trek Viking Mosaic": marsShadedRelief
};

const overlayMaps = {
  "NASA MOLA Altitude Relief (PIA02820)": molaElevationOverlay,
  "Hazard Zones (Slopes >20&deg;)": hazardLayerGroup,
  "Safe EVA Route Path": routeLayerGroup,
  "Science Targets & Bases": poiLayerGroup
};

L.control.layers(baseMaps, overlayMaps, { position: 'topright', collapsed: false }).addTo(map);

// 3. MOLA Scale Legend (Bottom Left)
const molaLegend = L.control({ position: 'bottomleft' });
molaLegend.onAdd = function () {
  const div = L.DomUtil.create('div', 'mola-legend');
  div.innerHTML = `
    <h4>NASA MOLA ALTITUDE [KM]</h4>
    <div class="mola-gradient-bar"></div>
    <div class="mola-labels">
      <span>-8</span>
      <span>-4</span>
      <span>0</span>
      <span>+4</span>
      <span>+8</span>
      <span>+12</span>
    </div>
  `;
  return div;
};
molaLegend.addTo(map);

// Route Loader & Telemetry
async function loadMissionRoute() {
  const site = document.getElementById('siteSelect').value;
  try {
    const res = await fetch(`/api/route/${site}`);
    const result = await res.json();

    if (!result.success) return alert("Failed to fetch route");

    hazardLayerGroup.clearLayers();
    routeLayerGroup.clearLayers();
    poiLayerGroup.clearLayers();

    const plan = result.plan;

    // Update Telemetry Panel
    document.getElementById('missionStatus').innerText = plan.mission_status;
    document.getElementById('distVal').innerText = plan.total_distance_km;
    document.getElementById('timeVal').innerText = plan.total_duration_hours;
    document.getElementById('o2Val').innerText = 100 - plan.o2_consumed_pct;
    document.getElementById('battVal').innerText = 100 - plan.battery_consumed_pct;

    // Sidebar Hazards
    const hazardBox = document.getElementById('hazardList');
    if (plan.hazards_avoided && plan.hazards_avoided.length > 0) {
      hazardBox.innerHTML = plan.hazards_avoided.map(h => 
        `<div>⚠️ <b>${h.name}</b><br>Type: ${h.type} | Slope: ${h.slope_deg}&deg;</div>`
      ).join('<hr style="border:0.5px solid #ff3860; margin:6px 0;">');
    }

    // 1. Hazards
    plan.hazards_avoided.forEach(h => {
      const hazardCircle = L.circle(h.coords, {
        color: '#ff3860',
        fillColor: '#ff3860',
        fillOpacity: 0.45,
        weight: 2,
        radius: h.radius_meters || 600
      }).bindPopup(`
        <div style="color:#000; font-family:sans-serif;">
          <h4 style="color:#d9534f; margin:0 0 4px;">DANGER ZONE: ${h.name}</h4>
          <b>Type:</b> ${h.type}<br>
          <b>Slope Gradient:</b> ${h.slope_deg}&deg;<br>
          <i>Path deflected to avoid rover/suit wheel entrapment.</i>
        </div>
      `);
      hazardLayerGroup.addLayer(hazardCircle);
    });

    // 2. Safe EVA Path
    const waypoints = plan.waypoints;
    const routeLine = L.polyline(waypoints, {
      color: '#38ef7d',
      weight: 4,
      dashArray: '8, 8'
    });
    routeLayerGroup.addLayer(routeLine);

    // 3. Markers
    const startMarker = L.marker(waypoints[0]).bindPopup(`
      <div style="color:#000; font-family:sans-serif;">
        <h4 style="margin:0 0 4px; color:#2e7d32;">HABITAT BASE (START)</h4>
        <b>Status:</b> Safe Departure Point<br>
        <b>Life Support:</b> 100% Nominal
      </div>
    `);
    poiLayerGroup.addLayer(startMarker);

    const endMarker = L.marker(waypoints[waypoints.length - 1]).bindPopup(`
      <div style="color:#000; font-family:sans-serif;">
        <h4 style="margin:0 0 4px; color:#1565c0;">UNSTUDIED SCIENCE POI</h4>
        <b>Mission Target:</b> Ancient Bedrock Core<br>
        <b>Status:</b> High Priority EVA Objective
      </div>
    `);
    poiLayerGroup.addLayer(endMarker);

    map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });

  } catch (err) {
    console.error(err);
    alert("Unable to load the mission route. Check that the Mars Navigator server is running.");
  }
}

document.getElementById('loadBtn').addEventListener('click', loadMissionRoute);
loadMissionRoute();