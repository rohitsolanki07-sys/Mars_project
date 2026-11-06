const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');

// Create the web server and choose a preferred port. If that port is busy,
// the server will try the other common development ports listed below.
const app = express();
const envPort =
  process.env.PORT !== undefined && process.env.PORT !== ''
    ? Number(process.env.PORT)
    : 3000;
const CANDIDATE_PORTS = Array.from(
  new Set([envPort, 3000, 5500, 3001, 3002, 5050, 8080, 0])
);

app.use(cors());
app.use(express.json());

// Find the surface distance between two latitude/longitude points on Mars.
// The result is an estimate in kilometres, using Mars's average radius.
function calculateDistance(coord1, coord2) {
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

// Keep the mission information in one JSON file, and reload it when that file
// changes so edits can appear without restarting the server.
const dataFilePath = path.join(__dirname, 'Data', 'marsData.json');
const frontendDir = path.join(__dirname, '..', 'frontend');
let marsData = {};

function loadMarsData() {
  try {
    marsData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    console.log('SUCCESS: marsData.json loaded successfully!');
  } catch (err) {
    // Keep the server running, but report the problem so it is visible.
    console.error('ERROR loading marsData.json:', err.message);
  }
}

loadMarsData();

// Browsers connected to this list receive a notice when mission data or
// frontend files change. This lets the page refresh without manual checking.
const sseClients = new Set();

function broadcastEvent(type, payload = {}) {
  const message = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

// Combine several quick file notifications into one reload message, so a
// single save does not cause repeated reloads.
let watchDebounce = null;
function scheduleBroadcast(type) {
  clearTimeout(watchDebounce);
  watchDebounce = setTimeout(() => {
    if (type === 'data-reload') {
      loadMarsData();
    }
    broadcastEvent('reload', { reason: type, timestamp: Date.now() });
  }, 120);
}

// Watch the mission-data folder and reload its data when the JSON file changes.
try {
  fs.watch(path.dirname(dataFilePath), (eventType, filename) => {
    if (!filename || filename === 'marsData.json') {
      scheduleBroadcast('data-reload');
    }
  });
} catch (_) {
  // File watching is optional and may not be supported on every computer.
}

// Also notify connected browsers when a frontend file is edited.
try {
  fs.watch(frontendDir, (eventType, filename) => {
    if (filename) {
      scheduleBroadcast('frontend-update');
    }
  });
} catch (_) {
  // File watching is optional and may not be supported on every computer.
}

let activePort = envPort;
let activeServer = null;

// A simple check used by tools and the frontend to confirm the server is up.
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'mars-navigator',
    port: activePort
  });
});

// Keep this browser connection open so the server can send live-reload notices.
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected', port: activePort })}\n\n`);
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Return the saved mission information for a named landing site.
app.get('/api/mission/:site', (req, res) => {
  const site = req.params.site.toLowerCase();
  if (marsData[site]) {
    return res.json({ success: true, site: site, data: marsData[site] });
  }
  return res.status(404).json({ success: false, message: 'Site not found' });
});

// Return an estimated distance and suit-resource forecast for a site's
// saved route. Each pair of neighbouring waypoints makes one route segment.
app.get('/api/route/:site', (req, res) => {
  const site = req.params.site.toLowerCase();
  const siteData = marsData[site];

  if (!siteData) {
    return res.status(404).json({ success: false, message: 'Site not found' });
  }

  // Add the distances of all route segments to get the full route length.
  const waypoints = siteData.safe_route || [];
  let dist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    dist += calculateDistance(waypoints[i], waypoints[i + 1]);
  }

  // Estimate walking time at a fixed average speed, then add time for science
  // work. These are planning estimates, not live suit readings.
  const walkHours = dist / 2.2;
  const totalHours = walkHours + 1.5;

  return res.json({
    success: true,
    site: site,
    plan: {
      mission_status: 'GO_FOR_EVA',
      total_distance_km: Number(dist.toFixed(2)),
      total_duration_hours: Number(totalHours.toFixed(2)),
      waypoints: waypoints,
      o2_consumed_pct: Math.min(100, Math.round(totalHours * 6.5)),
      battery_consumed_pct: Math.min(100, Math.round(totalHours * 8.0)),
      hazards_avoided: siteData.hazards || []
    }
  });
});

// Make the website available from the same server as the API.
app.use(express.static(frontendDir));
app.use('/frontend', express.static(frontendDir));

function openBrowser(url) {
  // Do not open a window during automated tests or in headless environments.
  if (process.env.NO_OPEN === '1' || process.env.CI === 'true' || process.env.NODE_ENV === 'test') {
    return;
  }

  // Use the operating system's standard command to open the website.
  const platform = process.platform;
  const cmd =
    platform === 'darwin'
      ? `open "${url}"`
      : platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;

  // The browser is a convenience; the server can still be used if opening it fails.
  exec(cmd, () => {});
}

function startServer(portIndex = 0) {
  const portToTry = CANDIDATE_PORTS[portIndex] ?? 0;
  const server = app.listen(portToTry, () => {
    activeServer = server;
    const address = server.address();
    activePort = typeof address === 'object' && address ? address.port : portToTry;
    const url = `http://localhost:${activePort}`;
    console.log(`Server running at ${url}`);

    // Open the page only if a browser has not already connected for live updates.
    setTimeout(() => {
      if (sseClients.size === 0) {
        openBrowser(url);
      }
    }, 800);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && portIndex + 1 < CANDIDATE_PORTS.length) {
      // Another app is using this port, so try the next available choice.
      console.warn(`Port ${portToTry} is in use, switching to next available port...`);
      startServer(portIndex + 1);
    } else {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    }
  });

  return server;
}

// Close browser connections and stop accepting requests when the app is asked
// to shut down (for example, when the user presses Ctrl+C).
function shutdown() {
  for (const client of sseClients) {
    client.end();
  }
  sseClients.clear();
  if (activeServer) {
    activeServer.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

// Listen for common operating-system shutdown signals.
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server only when this file is run directly, not when imported by a test.
if (require.main === module) {
  startServer();
}

// Export these pieces so tests and other backend files can reuse them.
module.exports = { app, startServer };
