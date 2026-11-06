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

function buildPlanFromSiteData(siteData) {
  const waypoints = siteData.safe_route || [];
  let dist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    dist += calculateMarsDistance(waypoints[i], waypoints[i + 1]);
  }
  const walkHours = dist / 2.2;
  const totalHours = walkHours + 1.5;

  return {
    mission_status: "GO_FOR_EVA",
    total_distance_km: Number(dist.toFixed(2)),
    total_duration_hours: Number(totalHours.toFixed(2)),
    waypoints: waypoints,
    o2_consumed_pct: Math.min(100, Math.round(totalHours * 6.5)),
    battery_consumed_pct: Math.min(100, Math.round(totalHours * 8.0)),
    hazards_avoided: siteData.hazards || []
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

  // 1. Try same-origin API on whatever port the user's PC is currently running
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    try {
      const apiRes = await fetch(`/api/route/${key}`);
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json && json.success && json.plan) {
          connectLiveReload();
          return json.plan;
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
  if (FALLBACK_MARS_DATA[key]) {
    return buildPlanFromSiteData(FALLBACK_MARS_DATA[key]);
  }

  throw new Error(`Unknown mission site: ${site}`);
}

// Route Loader & Telemetry
async function loadMissionRoute() {
  const site = document.getElementById('siteSelect').value;
  try {
    const plan = await getMissionPlan(site);

    hazardLayerGroup.clearLayers();
    routeLayerGroup.clearLayers();
    poiLayerGroup.clearLayers();

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
  }
}

document.getElementById('loadBtn').addEventListener('click', loadMissionRoute);
document.getElementById('siteSelect').addEventListener('change', loadMissionRoute);
loadMissionRoute();
