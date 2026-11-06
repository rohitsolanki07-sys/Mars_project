require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Distance calculation
function calculateDistance(coord1, coord2) {
  const R = 3389.5; 
  const dLat = (coord2[0] - coord1[0]) * (Math.PI / 180);
  const dLon = (coord2[1] - coord1[1]) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(coord1[0] * Math.PI / 180) * Math.cos(coord2[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Direct data read
const dataFilePath = path.join(__dirname, 'Data', 'marsData.json');
let marsData = {};
try {
  marsData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
  console.log("SUCCESS: marsData.json loaded successfully!");
} catch (err) {
  console.error("ERROR loading marsData.json:", err.message);
}

app.get('/api/mission/:site', (req, res) => {
  const site = req.params.site.toLowerCase();
  if (marsData[site]) {
    return res.json({ success: true, site: site, data: marsData[site] });
  }
  return res.status(404).json({ success: false, message: "Site not found" });
});

app.get('/api/route/:site', (req, res) => {
  const site = req.params.site.toLowerCase();
  const siteData = marsData[site];
  
  if (!siteData) {
    return res.status(404).json({ success: false, message: "Site not found" });
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
      mission_status: "GO_FOR_EVA",
      total_distance_km: Number(dist.toFixed(2)),
      total_duration_hours: Number(totalHours.toFixed(2)),
      waypoints: waypoints,
      o2_consumed_pct: Math.min(100, Math.round(totalHours * 6.5)),
      battery_consumed_pct: Math.min(100, Math.round(totalHours * 8.0)),
      hazards_avoided: siteData.hazards || []
    }
  });
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});