module.exports = Object.freeze({
  marsEquatorialRadiusMeters: 3396190,
  grid: Object.freeze({
    // Default and minimum resolution reduced to 250 m / 100 m so the planner
    // samples the terrain more densely, catching smaller hazards and pits.
    defaultResolutionMeters: 250,
    minimumResolutionMeters: 100,
    maximumResolutionMeters: 2000,
    // Larger grid dimension to accommodate the higher cell count at finer
    // resolution without hitting the per-request sample limit prematurely.
    maximumDimension: 75,
    paddingCells: 4
  }),
  endpoints: Object.freeze({
    maximumSnapDistanceMeters: 5000
  }),
  terrain: Object.freeze({
    slopeDegrees: Object.freeze({
      // Tighter preferred threshold flags gentle inclines sooner so the router
      // avoids small ridges around pit rims before the full slope develops.
      preferred: 7,
      caution: 15,
      highRisk: 22
    }),
    roughnessMeters: Object.freeze({
      // Lower roughness limits pick up boulder fields and uneven pit floors
      // that the original 2 m / 5 m / 10 m thresholds would pass through.
      preferred: 1,
      caution: 3,
      highRisk: 7
    }),
    elevationChangeMeters: Object.freeze({
      // Tighter elevation-change limits flag even shallow pits and ridges
      // as caution or high-risk so the A* router prefers smoother paths.
      preferred: 3,
      caution: 8,
      highRisk: 20
    }),
    // Wider roughness neighbourhood samples a 5×5 patch instead of 3×3,
    // spreading the measurement over more cells so isolated rough pixels
    // don't dominate and small depressions are captured in the average.
    roughnessNeighborhoodRadiusCells: 2
  }),
  craterDetection: Object.freeze({
    // Add half-cell and single-cell radii so the annulus scanner can detect
    // sub-resolution pits and shallow pothole-sized depressions.  The larger
    // radii are kept to catch crater rims of all sizes.
    annulusRadiiCells: Object.freeze([0.5, 1, 1.5, 2, 3, 4, 5, 6, 8]),
    annulusHalfWidthCells: 0.75,
    // Require only 5 of 8 sectors to be elevated (down from 7) so that
    // irregular or partially-eroded pits are still flagged.
    minimumElevatedSectors: 5,
    // Lower minimum depth so shallow potholes (≥5 m deep rather than ≥20 m)
    // trigger the crater mask and are excluded from the route.
    minimumDepthMeters: 5,
    // Fine-grained depth-per-cell scaling ensures that at the finer 100 m
    // resolution a 10 m deep pit is still flagged.
    minimumDepthPerCellMeters: 0.05,
    // Extra safety buffer around detected depressions so the route steers
    // well clear of pit edges rather than hugging the rim.
    safetyBufferCells: 2
  }),
  hazards: Object.freeze({
    // Wider default exclusion buffer steers the route further from known
    // hazard centres before the terrain model must compensate.
    defaultBufferMeters: 500,
    minimumBufferMeters: 0,
    maximumBufferMeters: 5000
  }),
  costWeights: Object.freeze({
    // Increase the thermal-transition weight so material boundary crossings
    // incur a stronger penalty and the router avoids them more aggressively.
    thermalTransition: 0.25,
    preferred: 1,
    // Raise intermediate penalties so the cost gap between safe and risky
    // terrain is wider, pushing the A* path further away from danger.
    caution: 8,
    highRisk: 30,
    severe: 60,
    softHazard: 30
  }),
  unknownElevationPolicy: 'block',
  nasaMola: Object.freeze({
    serviceUrl:
      'https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw/ImageServer',
    expectedElevationUnits: 'meters',
    minimumElevationMeters: -8528,
    maximumElevationMeters: 21230,
    sampleCacheSize: 20000
  })
});
