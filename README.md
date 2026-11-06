# Mars Navigator

Mars Navigator is a small web application for viewing simulated EVA routes, hazards, and suit telemetry at selected Mars sites. The map uses NASA/JPL Mars Trek's Viking MDIM 2.1 global color mosaic, rendered through its official ArcGIS ImageServer. The API serves mission data from a local JSON file.

## Project structure

```text
backend/. --Edited part
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
LICENSE
README.md
```

## Requirements

- Node.js 18 or newer
- npm

## Run locally

1. Install the backend dependencies:

   ```sh
   cd backend
   npm install
   ```

2. Optionally set a `PORT` environment variable to choose a different port. The default is `3000`.

3. Start the API:

   ```sh
   npm start
   ```

4. Open the URL printed by the server (by default, `http://localhost:3000`). The server hosts both the frontend and API, so the site works on the same port even if you choose a custom `PORT`.

Run the backend tests from the `backend/` directory with `npm test`.

## API

- `GET /api/mission/:site` returns mission data for a site.
- `GET /api/route/:site` returns route waypoints and estimated mission telemetry.

Supported site keys are `jezero_crater` and `mount_sharp`.

## Notes

The route and telemetry data are local demonstration data, not operational guidance. Mars Trek map imagery requires an internet connection. Basemap source: [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/), [Viking MDIM 2.1 global color mosaic service](https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_Viking_MDIM21_ClrMosaic_global_232m/ImageServer).
