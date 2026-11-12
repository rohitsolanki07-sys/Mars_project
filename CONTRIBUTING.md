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
  when its layer is enabled and the map is zoomed in: the
  [Curiosity HiRISE mosaic](https://trek.nasa.gov/mars/trekarcgis/rest/services/curiosity_hirise_mosaic/ImageServer)
  covers part of Gale Crater at about 0.25 metres per pixel, and the
  [InSight CTX mosaic](https://trek.nasa.gov/mars/trekarcgis/rest/services/InSightCTXMosaic_112917_gcs/ImageServer)
  covers the InSight landing region at about 5 metres per pixel. These local
  image layers are clipped to their published extents; the global Viking map
  remains visible elsewhere.
  All image layers request finer tiles as the camera zooms in, up to the
  maximum level supported for that source. Optional layers start off; turn on
  each desired overlay individually in the Layers view.

### Curiosity rover information

The Layers view can show Curiosity's high-resolution Gale Crater image and its
recorded traverse and named stops. The rover layer is loaded from NASA Mars
Trek's public ArcGIS feature services:

- [Curiosity traverse path](https://trek.nasa.gov/mars/trekarcgis/rest/services/curiosity_path/MapServer/0)
  supplies the recorded route.
- [Curiosity waypoint layer](https://trek.nasa.gov/mars/trekarcgis/rest/services/curiosity_waypoints/MapServer/0)
  supplies named stops, coordinates, and links to the corresponding NASA Mars
  Trek feature pages.

The path and waypoint records are map data, not a live rover location feed.
Click a named stop for its coordinates and NASA Mars Trek source page, or use
**Go to Gale Crater** to move the map to the rover's region.

### Perseverance rover information

The Layers view can show a NASA Mars Trek image preview of Jezero Crater and
Perseverance's recorded traverse, landing ellipse, and named locations. The map
records are retrieved from NASA Mars Trek's public ArcGIS feature services:

- [Perseverance traverse path](https://trek.nasa.gov/mars/trekarcgis/rest/services/Perseverance_Traverse_Path/MapServer/0)
  supplies recorded route segments.
- [Perseverance named locations](https://trek.nasa.gov/mars/trekarcgis/rest/services/mars2020_waypoints/MapServer/0)
  supplies named sites and links to their NASA Mars Trek pages.
- [Perseverance landing ellipse](https://trek.nasa.gov/mars/trekarcgis/rest/services/perseverance_landing_ellipse/MapServer/0)
  supplies the landing area outline.
- [Jezero Crater image](https://trek.nasa.gov/assets/bookmarks/mars/perseverance/jezero-crater/jezero_crater.jpg)
  is a site image preview in the Layers panel; it is not a georeferenced map
  mosaic.

These are historical map records, not a live rover location feed. Use **Go to
Jezero Crater** to move the map to the landing site.

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

### Credits and source count

The in-app Credits view attributes **13 NASA/JPL Mars Trek service layers**:
three global/MOLA services, three Curiosity services, one InSight image
service, three Perseverance services, and three nomenclature/feature services.
The Perseverance Jezero site image is a separate static preview, making one
additional image asset. These are data services and assets, not NASA software
tools. The USGS Gazetteer of Planetary Nomenclature is linked as the reference
for approved feature names; it is not counted as a Mars Trek layer.

The app's 3D map uses CesiumJS, and the web/API server uses Express and Node.js.
Provider credits do not indicate endorsement. The About view names the
NeuroMars team members Rohit Solanki and Gourav Jangid.

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

### Experimental terrain-aware navigation

The **Find a lower-risk terrain route** control requests a bounded grid of
elevation samples from the same live NASA Mars Trek MOLA/HRSC DEM ImageServer.
The backend reads that service's pixel size and spatial reference at runtime,
then samples each grid location with the ImageServer `getSamples` operation.
It does not download or bundle a global elevation raster. The service has
roughly 200-metre native horizontal spacing near the equator; actual ground
spacing varies with latitude. Choosing a finer planning grid does not add
detail to the source elevation data.

The backend analyzes slope, local elevation variation, and known hazard
buffers, then uses A* search with eight-direction movement. Local relief is
measured after removing the neighborhood's estimated planar slope, so a smooth
incline is evaluated as slope rather than incorrectly treated as roughness.
Roughness and elevation-change thresholds scale with planning-cell spacing to
avoid applying metre-scale limits to coarse cells on long routes. Steep slopes,
restricted hazards, and unknown/NoData cells remain blocked, and diagonal
moves cannot cut between blocked cells. The local distance calculation is an
approximation on Mars; the output is intentionally labelled low confidence.
MOLA cannot resolve small rocks, cracks, or astronaut-scale hazards, and the
result is not certified for mission use. The slope, roughness,
elevation-change, and cost thresholds are prototype assumptions, not NASA
human-traverse standards or NASA-endorsed route recommendations.

Grid spacing can be selected from 250 to 2,000 metres. To keep external requests
bounded, the grid is capped at 55 rows by 55 columns; longer routes increase
their spacing to fit. Elevation requests are batched, with a bounded in-memory
sample cache. The grid bounds, terrain thresholds, hazard buffer, cost weights,
NASA service URL, and cache limit are documented together in
`backend/Services/TerrainNavigationConfig.js`.

If a selected endpoint lands on unknown or restricted terrain, the planner
first searches the normal grid, then expands the sampling area if needed to
find the nearest traversable cell. For local grids, this search is capped at
5 kilometres; for coarse long-distance grids, it can extend up to one cell so
widely separated coordinates can connect to sampled terrain. The actual
adjusted location and offset are returned and displayed. The expanded sample
grid is still capped at 55 rows by 55 columns, so its planning cells become
coarser when the route area reaches the grid limit; the result reports the
actual resolution. A disconnected initial route also triggers a retry with a
wider grid. Endpoints inside an explicitly supplied restricted hazard are
rejected rather than moved. Terrain between coarse samples is not evaluated;
these routes remain low-confidence planning support.

`POST /api/navigation/terrain` accepts `start` and `destination` objects with
decimal-degree `latitude` and `longitude`, an optional `resolutionMeters`, and
an optional `hazards` array. A circular hazard can provide `center`,
`radiusMeters`, and `bufferMeters`; a polygon can provide at least three
`{ "latitude": ..., "longitude": ... }` points. Invalid requests return HTTP
400, a route blocked by hazards or unknown terrain returns HTTP 422, and
NASA-service failures or areas with no valid elevation samples return HTTP 502.
The response includes route coordinates,
distance, terrain and slope summaries, sample coverage, data-source metadata,
and explicit confidence limitations.

Algorithm tests use synthetic grids so the pathfinder can be tested without
relying on network availability or pretending that synthetic values are NASA
data. The data-service tests mock NASA responses to verify metadata handling,
sampling, and NoData behavior.

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
