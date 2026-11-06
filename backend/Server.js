const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');

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

// Distance calculation (Mars radius ≈ 3389.5 km)
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

// Dynamic data loader so edits to marsData.json apply without restarting
const dataFilePath = path.join(__dirname, 'Data', 'marsData.json');
const frontendDir = path.join(__dirname, '..', 'frontend');
let marsData = {};

function loadMarsData() {
  try {
    marsData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    console.log('SUCCESS: marsData.json loaded successfully!');
  } catch (err) {
    console.error('ERROR loading marsData.json:', err.message);
  }
}

loadMarsData();

// Live-reload SSE clients so frontend and backend stay in sync automatically
const sseClients = new Set();

function broadcastEvent(type, payload = {}) {
  const message = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

// Watch marsData.json and frontend files for live changes
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

try {
  fs.watch(path.dirname(dataFilePath), (eventType, filename) => {
    if (!filename || filename === 'marsData.json') {
      scheduleBroadcast('data-reload');
    }
  });
} catch (_) {
  // Ignore watch errors on unsupported filesystems
}

try {
  fs.watch(frontendDir, (eventType, filename) => {
    if (filename) {
      scheduleBroadcast('frontend-update');
    }
  });
} catch (_) {
  // Ignore watch errors on unsupported filesystems
}

let activePort = envPort;
let activeServer = null;

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'mars-navigator',
    port: activePort
  });
});

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

app.get('/api/mission/:site', (req, res) => {
  const site = req.params.site.toLowerCase();
  if (marsData[site]) {
    return res.json({ success: true, site: site, data: marsData[site] });
  }
  return res.status(404).json({ success: false, message: 'Site not found' });
});

app.get('/api/route/:site', (req, res) => {
  const site = req.params.site.toLowerCase();
  const siteData = marsData[site];

  if (!siteData) {
    return res.status(404).json({ success: false, message: 'Site not found' });
  }

  const waypoints = siteData.safe_route || [];
  let dist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    dist += calculateDistance(waypoints[i], waypoints[i + 1]);
  }

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

app.use(express.static(frontendDir));
app.use('/frontend', express.static(frontendDir));

function openBrowser(url) {
  if (process.env.NO_OPEN === '1' || process.env.CI === 'true' || process.env.NODE_ENV === 'test') {
    return;
  }
  const platform = process.platform;
  const cmd =
    platform === 'darwin'
      ? `open "${url}"`
      : platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;

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

    // Automatically open the frontend in the browser if no existing tab reconnects within 800ms
    setTimeout(() => {
      if (sseClients.size === 0) {
        openBrowser(url);
      }
    }, 800);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && portIndex + 1 < CANDIDATE_PORTS.length) {
      console.warn(`Port ${portToTry} is in use, switching to next available port...`);
      startServer(portIndex + 1);
    } else {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    }
  });

  return server;
}

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

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
