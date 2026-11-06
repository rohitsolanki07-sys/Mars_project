# Contributing and project resources

Thank you for helping improve Mars Navigator. This guide describes how to make
changes and where the project's maps, place names, data, and software come
from.

## Contributing changes

1. Fork the repository and create a branch for your change.
2. Keep changes focused, and follow the existing JavaScript and CSS style.
3. If you change behavior, add or update a test where practical.
4. Run the checks before opening a pull request:

   ```sh
   node --check frontend/app.js
   node --check backend/Server.js
   npm test
   ```

5. In your pull request, explain what changed, how you tested it, and include
   screenshots for visible map or layout changes.

Do not commit passwords, API keys, private files, generated dependencies, or
unverified mission data. Keep `backend/Data/marsData.json` valid JSON; add
explanations to documentation rather than comments inside that file.

## Data and map resources

### Map imagery

- [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/) provides the Mars map
  imagery used by the app.
- The base map requests the
  [Viking MDIM 2.1 global color mosaic](https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_Viking_MDIM21_ClrMosaic_global_232m/ImageServer).
  Tiles are requested from its ArcGIS ImageServer as the map is viewed.

### Place names and feature information

Place labels and their map popups are loaded for the visible map area from
NASA Mars Trek's public ArcGIS services:

- [Outreach nomenclature feature layer](https://trek.nasa.gov/mars/trekarcgis/rest/services/outreach_nomenclature/MapServer/0)
  provides named features and, when available, feature type, recorded size,
  category, description, approval date, notes, and a link to the USGS record.
- [Major surface features layer](https://trek.nasa.gov/mars/trekarcgis/rest/services/major_features/MapServer/0)
  provides names and labels for major features.
- [Mars regions layer](https://trek.nasa.gov/mars/trekarcgis/rest/services/mars_regions/MapServer/0)
  provides named regional features.
- The nomenclature records can link to the
  [USGS Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/),
  which is the referenced source for individual approved planetary names.

These are live services, so labels and available details depend on network
access and on the records returned for the current map area. Empty fields are
not filled with invented descriptions.

### Elevation overlay

The optional elevation overlay uses the
[Mars elevation tile layer](https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-elevation-v0-1/all/{z}/{x}/{y}.png),
credited in the application to NASA's Mars Global Surveyor Mars Orbiter Laser
Altimeter (MOLA) elevation data.

Named-place labels and custom coordinate lookups sample elevation values from
NASA Mars Trek's
[MOLA/HRSC blended digital elevation model ImageServer](https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw/ImageServer).
The returned raster values are shown in metres. Nearby labels are spaced to
reduce overlap; denser areas may show fewer map labels than the number of
places available in the endpoint selectors.

### Local demonstration mission data

`backend/Data/marsData.json` contains the project's local example landing
sites, routes, hazards, and environmental values. It is application data, not
a live NASA feed or certified operational guidance. Route distance, travel
time, oxygen, and battery values are estimates calculated by this project.
Do not describe them as real-time measurements or flight-qualified guidance.

## Software and interface resources

- [Leaflet 1.9.4](https://leafletjs.com/) displays the interactive map.
- [Express](https://expressjs.com/) serves the API and frontend;
  [cors](https://github.com/expressjs/cors) configures cross-origin API access;
  [dotenv](https://github.com/motdotla/dotenv) loads local environment
  settings.
- [Inter](https://fonts.google.com/specimen/Inter) and
  [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) are
  loaded from Google Fonts.
- The sidebar and route controls use familiar map-navigation conventions, but
  the project does not use Google Maps tiles, data, or APIs.
- Node.js built-in APIs provide file reading, file watching, HTTP requests,
  and the test runner.

Check each provider's current terms and attribution requirements before
redistributing its data or assets. The use of a resource in this project does
not imply NASA, JPL, USGS, or another provider endorses Mars Navigator.
