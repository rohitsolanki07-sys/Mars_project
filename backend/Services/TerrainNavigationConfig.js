module.exports = Object.freeze({
  marsEquatorialRadiusMeters: 3396190,
  grid: Object.freeze({
    defaultResolutionMeters: 500,
    minimumResolutionMeters: 250,
    maximumResolutionMeters: 2000,
    maximumDimension: 55,
    paddingCells: 3
  }),
  endpoints: Object.freeze({
    maximumSnapDistanceMeters: 5000
  }),
  terrain: Object.freeze({
    slopeDegrees: Object.freeze({
      preferred: 10,
      caution: 20,
      highRisk: 25
    }),
    roughnessMeters: Object.freeze({
      preferred: 2,
      caution: 5,
      highRisk: 10
    }),
    elevationChangeMeters: Object.freeze({
      preferred: 5,
      caution: 15,
      highRisk: 30
    }),
    roughnessNeighborhoodRadiusCells: 1
  }),
  craterDetection: Object.freeze({
    annulusRadiiCells: Object.freeze([2, 3, 4, 5, 6, 8]),
    annulusHalfWidthCells: 0.75,
    minimumElevatedSectors: 7,
    minimumDepthMeters: 20,
    minimumDepthPerCellMeters: 0.04,
    safetyBufferCells: 1
  }),
  hazards: Object.freeze({
    defaultBufferMeters: 350,
    minimumBufferMeters: 0,
    maximumBufferMeters: 5000
  }),
  costWeights: Object.freeze({
    thermalTransition: 0.15
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
