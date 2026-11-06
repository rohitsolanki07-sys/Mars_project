# Mars Navigator

Mars Navigator is a web application for viewing simulated EVA routes, hazards, and suit telemetry at selected Mars sites. The map uses NASA/JPL Mars Trek's Viking MDIM 2.1 global color mosaic, rendered through its official ArcGIS ImageServer. The API serves mission data from a local JSON file.

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

Supported site keys are `jezero_crater` and `mount_sharp`.

## Notes

The route and telemetry data are local demonstration data, not operational guidance. Mars Trek map imagery requires an internet connection. Basemap source: [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/), [Viking MDIM 2.1 global color mosaic service](https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_Viking_MDIM21_ClrMosaic_global_232m/ImageServer).
