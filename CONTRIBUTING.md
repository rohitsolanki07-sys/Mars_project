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
- [CesiumJS](https://cesium.com/platform/cesiumjs/) displays the map on a
  navigable Mars-sized 3D ellipsoid. Drag to rotate, use the mouse wheel to
  zoom, and right-drag to tilt the view.
- The base map requests the
  [Viking MDIM 2.1 global color mosaic](https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_Viking_MDIM21_ClrMosaic_global_232m/ImageServer).
  Geographic tiles are requested from its ArcGIS ImageServer as the globe is
  viewed, and are rendered in Mars Trek's native spatial reference. This
  global image is about 232 metres per pixel, so it cannot show fine surface
  details everywhere, no matter how far the camera zooms.
- Higher-resolution Mars Trek imagery is loaded over its actual coverage areas
  when zooming in: the
  [Curiosity HiRISE mosaic](https://trek.nasa.gov/mars/trekarcgis/rest/services/curiosity_hirise_mosaic/ImageServer)
  covers part of Gale Crater at about 0.25 metres per pixel, and the
  [InSight CTX mosaic](https://trek.nasa.gov/mars/trekarcgis/rest/services/InSightCTXMosaic_112917_gcs/ImageServer)
  covers the InSight landing region at about 5 metres per pixel. These local
  image layers are clipped to their published extents; the global Viking map
  remains visible elsewhere.
  All image layers request finer tiles as the camera zooms in, up to the
  maximum level supported for that source.
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

### MOLA terrain overlay

The optional, sidebar-controlled MOLA terrain overlay is rendered from NASA
Mars Trek's
[MOLA/HRSC color-shaded relief ImageServer](https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp/ImageServer).
The layer is requested as geographic globe tiles from the service's
`exportImage` endpoint and is hidden or shown with the **MOLA color-shaded
terrain** button. It is an image overlay, not a 3D elevation mesh. Place names,
route lines, hazards, and custom coordinate picks are also drawn on the globe.

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

- [CesiumJS](https://cesium.com/platform/cesiumjs/) renders and navigates the
  interactive 3D Mars globe.
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
