# Mars Navigator

Mars Navigator is a small web application for viewing simulated EVA routes, hazards, and suit telemetry at selected Mars sites. The map uses Leaflet and Mars imagery tiles; the API serves mission data from a local JSON file.

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

2. Optionally copy `backend/.env.example` to `backend/.env` and set a `PORT` value. The default is `5000`.

3. Start the API:

   ```sh
   npm start
   ```

4. Open `frontend/index.html` in a browser. The frontend requests the API at `http://localhost:5000`.

Run the backend tests from the `backend/` directory with `npm test`.

## API

- `GET /api/mission/:site` returns mission data for a site.
- `GET /api/route/:site` returns route waypoints and estimated mission telemetry.

Supported site keys are `jezero_crater` and `mount_sharp`.

## Notes

The route and telemetry data are local demonstration data, not operational guidance. Map tiles require an internet connection.
