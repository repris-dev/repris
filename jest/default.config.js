export default {
  /** sampler */
  sampler: ['@sampler:stopwatch', {
    duration: {
      min: 500, max: 7_500
    },
    sampleSize: {
      min: 10, max: 5_000
    },
    warmup: {
      duration: {
        min: 100, max: 1_000
      },
      sampleSize: {
        min: 10
      },
    }
  }],

  sample: ['@sample:duration', {
    capacity: 500,
    significanceThreshold: 0.01,
  }],

  conflation: ['@conflation:duration', {
    size: {
      min: 2, max: 5
    },
    exclusionThreshold: 0.2,
  }],
  
  annotations: [
    { id: 'duration:n', displayName: 'iter.' },
    { id: 'duration:min', displayName: 'min' },
    {
      id: 'mode:kde',
      displayName: 'kde',
      quality: {
        id: 'mode:kde:dispersion',
        thresholds: [
          0,    // >= good
          0.02, // >= ok
          0.1,  // >= poor
        ],
      }
    },
    { id: 'conflation:mode:kde' },
  ],
}
