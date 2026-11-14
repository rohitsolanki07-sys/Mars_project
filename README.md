# AresNav — Mars EVA & Science Route Planner

**AresNav** is an interactive Mars exploration planning prototype by **NeuroMars**. It combines a navigable 3D Mars globe, public orbital and rover map records, local demonstration mission scenarios, and an experimental terrain and geology weighted route planner. The app is designed to make planetary map data approachable and to demonstrate how science context can inform route exploration.

> **Prototype notice:** AresNav is for research, education, and demonstration. It is not an operational navigation system, does not provide live astronaut or rover telemetry, and is not certified for mission use. Routes and suit figures are modeled estimates; map layers are incomplete and may be unavailable.

## What you can explore

- **3D Mars globe:** Rotate, zoom, and tilt a Mars sized globe rendered with CesiumJS and NASA/JPL Mars Trek's Viking MDIM 2.1 global color mosaic.
- **Mission scenarios:** Explore saved example sites at Jezero Crater and Mount Sharp, including demonstration waypoints, hazards, and environmental values.
- **Route planning:** Compare Suit Walk, Rover, and Scout travel modes; choose saved or mapped locations, or select custom endpoints directly on the map. Run a turn by turn visual simulation and review modeled distance, duration, oxygen, and battery estimates.
- **Experimental science route:** Request a lower cost route informed by sampled MOLA/HRSC elevation, MGS TES thermal map transitions, USGS global geology context, and known site hazards. The planner flags limitations and can create an offline text briefing.
- **Map layers and science context:** Optionally view MOLA color shaded relief, TES thermal inertia, global geology, hydrous mineral candidate detections, exploration zones, named surface features, and site hazard zones.
- **Rover archives:** Browse historical Curiosity and Perseverance traverse records, named stops, landing context, and available site imagery; inspect InSight regional imagery.
- **Guided field tour:** Take the in app 15 step tour or explore independently. Use the **?** control to resume or replay the guide.

## Quick start

### Requirements

- Node.js 18 or newer
- npm
- Internet access for CesiumJS, NASA Mars Trek, USGS linked resources, and remote map layers

### Run the application

From the project root:

```sh
npm install
npm start
```

The Express server hosts both the API and the frontend. It prefers port `3000`, then tries common alternatives if the port is busy; set `PORT` in `backend/.env` to choose a preferred port (`PORT=0` requests an available port). The app opens in the default browser when possible. You can also open `http://localhost:3000` (or the active port printed by the server). The root `index.html` redirects to the frontend.

The default `npm start` command uses Node's watch mode. Frontend edits and mission JSON changes notify connected browsers to reload; backend code changes restart the server. To run without watch mode, use `npm run serve`.

### Run tests

```sh
npm test
```

## Using the planner

1. Choose a site in the route planner and select departure and destination points from the menus, or use the map picking controls.
2. Choose a travel mode to compare modeled travel time and resource use. These values are generated from assumptions and local scenario data, not from live equipment.
3. Use **Start EVA Navigation** to play the visual route simulation. Exit from the navigation banner to stop it.
4. For the experimental route, choose a grid spacing and select **Find a geology-aware science route**. Review the returned path, terrain summaries, confidence notes, and review flags. Use **Download offline route briefing** to save a text summary.
5. Open **Layers** to enable map overlays individually. Click available names, rover stops, or science markers to inspect their source details.

The standard route summary is a direct point to point estimate. It does not automatically screen a custom direct route against hazards. The experimental planner samples a bounded grid (up to 55 by 55 cells), blocks unknown and steep or restricted terrain, considers supplied hazard areas and DEM detected crater like depressions, and may adjust endpoints to nearby sampled traversable cells. Large searches can use coarser spacing than selected. It cannot assess terrain between samples or detect every crater, small obstacle, or changing surface condition. Its confidence is low and its output is not a safety recommendation.

## Data and limitations

- **Local demonstration data:** `backend/Data/marsData.json` contains the saved site scenarios, routes, hazards, and environmental values. These are examples, not a live feed. Units and editing guidance are in [`backend/Data/README.md`](backend/Data/README.md).
- **NASA/JPL Mars Trek:** Supplies the base map, optional imagery and orbital products, place names, science and exploration features, rover traverses, and elevation samples. These features require internet access and can be unavailable.
- **USGS Astrogeology:** Supplies global geology context and links to the planetary nomenclature reference. Mapped units and orbital candidate detections do not verify surface composition, accessibility, or safety.
- **CesiumJS:** Renders the interactive Mars globe in the browser.

Rover records are historical map records, not live rover positions. Temperature, pressure, radiation, oxygen, battery, route distance, and duration displayed for the mission scenarios are static or modeled demonstration values, not real time sensor measurements. NASA, JPL, USGS, and other source providers do not endorse AresNav.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for detailed data sources, map services, terrain model assumptions, and contribution guidance.

## API overview

The local server exposes:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Server health and active port |
| `GET /api/events` | Server sent events used for live reload |
| `GET /api/mission/:site` | Saved scenario data (`jezero_crater`, `mount_sharp`) |
| `GET /api/route/:site` | Saved route and modeled mission estimates |
| `GET /api/places?bbox=west,south,east,north` | Mars place names in a map area |
| `GET /api/science-sites?bbox=west,south,east,north` | Nearby science candidates and exploration zones |
| `GET /api/exploration-info?latitude=…&longitude=…&radiusMeters=…` | Exploration features near a coordinate |
| `GET /api/curiosity` | Historical Curiosity path and stops |
| `GET /api/perseverance` | Historical Perseverance path, locations, and landing ellipse |
| `GET /api/elevation?points=lat,lon;lat,lon` | MOLA elevation samples for 1–20 coordinate pairs |
| `POST /api/navigation/terrain` | Experimental geology and terrain weighted route |

Example terrain route request:

```json
{
  "start": { "latitude": 18.4447, "longitude": 77.4508 },
  "destination": { "latitude": 18.52, "longitude": 77.35 },
  "resolutionMeters": 500,
  "hazards": [
    {
      "name": "Example restricted area",
      "center": { "latitude": 18.48, "longitude": 77.4 },
      "radiusMeters": 250,
      "bufferMeters": 350,
      "restricted": true
    }
  ]
}
```

Coordinates are decimal degrees. The response includes route coordinates, distance and terrain summaries, sampled data coverage, source information, and confidence limitations. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for request details, route assumptions, and error behavior.

## Project layout

```text
backend/
  Data/marsData.json            # Local demonstration mission scenarios
  Services/                     # NASA data access and terrain/path analysis
  Server.js                     # Express API and static frontend server
  test/                         # Node.js built-in test suite
  .env.example                  # Port configuration example
frontend/
  index.html                    # App interface and guided tour
  app.js                        # Cesium globe, planner, and layer behavior
  style.css                     # Interface styling
index.html                      # Redirect to the frontend
CONTRIBUTING.md                 # Data sources, model details, contribution guide
```

## Team

**NeuroMars:** Rohit Solanki and Gourav Jangid.
