# Mars mission data guide

The `marsData.json` file stores the information the backend uses for each
landing site. It must remain valid JSON, so explanations belong in this guide
rather than as comments inside the data file.

## How sites are organized

Each top-level key is the short name the API uses for a site, such as
`jezero_crater` or `mount_sharp`. The value beside that key contains the
site's details:

- `site_name`: The human-readable name of the location.
- `center`: The approximate center of the area shown on the map.
- `base_habitat`: The habitat astronauts start from. `name` is its name,
  `coords` is its map location, and `elevation_m` is its elevation in metres.
- `unstudied_poi`: The planned science destination. `poi` means "point of
  interest." Its fields describe its name, location, elevation, and science
  objective.
- `hazards`: A list of known risks near the route. Each item describes the
  hazard's name, kind, danger level, location, and (where provided) size or
  slope.
- `telemetry`: Environmental readings and planning limits for the site.
- `safe_route`: The ordered map points the planned route follows, starting at
  the habitat and ending at the destination.

## Coordinates and units

Every `coords` value, as well as `center` and each point in `safe_route`, is an
array in this order: `[latitude, longitude]`. Both numbers are in degrees.

Elevations use metres (`m`); hazard radius uses metres; slope uses degrees;
temperature uses degrees Celsius (`c`); radiation is measured in millisieverts
per day (`msv_day`); atmospheric pressure is in pascals (`pa`); and the safe
spacewalk time is in hours.

## Editing the data

Keep the file valid JSON: use double quotes around property names and text,
separate items with commas, and do not add comments or a trailing comma. The
backend reloads this file when it changes. Route distance, travel time, and
suit-resource figures are estimates calculated from the saved route and
assumptions in the backend code; they are not live readings.
