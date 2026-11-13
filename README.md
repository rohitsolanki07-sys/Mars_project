# Mars Navigator

Mars Navigator is a web application for viewing simulated EVA routes, hazards, suit telemetry, and named surface features on an interactive 3D Mars globe. CesiumJS renders NASA/JPL Mars Trek's Viking MDIM 2.1 global color mosaic on a Mars-sized ellipsoid. Optional map layers start off and can be turned on individually, including MOLA/HRSC terrain, MGS TES global thermal inertia, place names, higher-resolution Curiosity and InSight imagery, and Curiosity and Perseverance rover records. Rover locations and details come from NASA Mars Trek and represent map records, not live rover tracking. The API serves mission-planning data from a local JSON file.

## Project structure

```text
backend/
  Data/
    marsData.json
  Services/
  Server.js
  package.json
  .env.example
frontend/
  app.js
  index.html
  style.css
package.json
LICENSE
README.md
```

## Requirements

- Node.js 18 or newer
- npm

## Run locally (Single Command)

You can start both the backend API and the frontend UI simultaneously from either the project root or `backend/`:

1. Install dependencies:

   ```sh
   npm install
   ```

2. Start the server and launch the app:

   ```sh
   npm start
   ```

What happens automatically when you run `npm start`:
- **Unified Server & Auto-Launch**: Express serves both the API and `frontend/index.html` and automatically opens the app in your default browser.
- **Automatic Port Fallback**: Starts on `PORT` (default `3000`). If `3000` is already in use on a machine, the server automatically switches to the next available port (`3001`, `3002`, `5050`, `8080`, etc.), and the frontend automatically detects the active backend port (even if `frontend/index.html` is opened directly or via an external dev server like VS Code Live Server).
- **Live Auto-Reload**: Runs with `node --watch` and Server-Sent Events (`/api/events`), so editing backend code, `marsData.json`, or frontend files (`index.html`, `app.js`, `style.css`) updates the running app automatically without manually restarting the server and refreshing the page.

Run the backend tests with `npm test`.

## API

- `GET /api/health` returns server status and active port.
- `GET /api/mission/:site` returns mission data for a site.
- `GET /api/route/:site` returns route waypoints and estimated mission telemetry.
- `GET /api/places?bbox=west,south,east,north` returns NASA Mars Trek place names for a map area.
- `GET /api/curiosity` returns Curiosity's recorded traverse and named stops from NASA Mars Trek.
- `GET /api/perseverance` returns Perseverance's recorded traverse, named locations, and landing ellipse from NASA Mars Trek.
- `GET /api/elevation?points=latitude,longitude` returns MOLA elevation samples for custom coordinates.
- `POST /api/navigation/terrain` samples NASA MOLA elevations and calculates an experimental lower-risk route.

Supported site keys are `jezero_crater` and `mount_sharp`.

The departure and arrival menus include saved mission waypoints and NASA place
names returned for the current map area. Use **Pick start on map** or **Pick
destination on map** to choose custom coordinates. The standard mission summary
is still a direct point-to-point estimate. To request an experimental terrain-
aware path between the selected endpoints, choose a grid spacing and click
**Find a lower-risk terrain route**. It uses NASA Mars Trek's live elevation
service and the selected mission site's known hazards.
When a terrain route is found, the planner also shows modeled review flags and
can download an offline text briefing with sampled route points and limitations.
If an endpoint falls on unknown or restricted terrain, the planner can move it
to the nearest traversable sampled cell. On local grids this search is capped
at 5 km; on a coarse grid, it can extend up to one cell so globally separated
coordinates can connect to sampled terrain. If the first grid has no
connected path, it retries with a wider grid. The adjusted location and
distance are shown with the result. Large searches use the bounded terrain
grid and may therefore have coarser planning resolution. For these coarse
grids, terrain-relief thresholds scale with cell spacing; the result remains
low confidence and does not assess terrain between sampled cells. Steep
slopes, restricted hazards, and unknown cells still block the route.

The terrain route API accepts latitude and longitude in decimal degrees:

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

The response includes the route coordinates, distance, terrain-cost estimate,
elevation and slope summaries, raster coverage, and confidence caveats. Invalid
requests return HTTP 400, an unavailable safe route or traversable endpoint
returns HTTP 422, and NASA-service failures return HTTP 502. The grid is
bounded to 55 by 55 cells; unknown elevation cells are not traversed. This
prototype is low-confidence planning support, not safety-certified or
operational guidance.
See [CONTRIBUTING.md](./CONTRIBUTING.md) for the elevation source, algorithm
assumptions, resolution limits, and configuration.

## Notes

The route and telemetry data are local demonstration data, not operational guidance. Mars Trek map imagery and place names require an internet connection. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the project's data, map, and software resources and contribution guidance. Basemap source: [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/), [Viking MDIM 2.1 global color mosaic service](https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_Viking_MDIM21_ClrMosaic_global_232m/ImageServer).

The in-app **Credits** view counts 14 live NASA/JPL Mars Trek service layers
and one Jezero image preview; these are data sources, not NASA software tools.
The **About** view identifies the NeuroMars team: Rohit Solanki and Gourav
Jangid.
