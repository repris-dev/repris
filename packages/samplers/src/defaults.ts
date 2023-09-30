/** Stopwatch sampler defaults */
export const STOPWATCH_SAMPLER = {
  warmup: {
    duration: {
      min: 100,
      max: 1_000,
    },
    sampleSize: {
      min: 1,
    },
  },

  duration: {
    min: 250,
    max: 10_000,
  },

  sampleSize: {
    min: 10,
    max: 10_000,
  },
} as const satisfies import('./samplers.js').stopwatch.Options;

/** Duration sample defaults */
export const DURATION_SAMPLE = {
  maxCapacity: 500,
  significanceThreshold: 0.025,
} as const satisfies import('./samples.js').duration.Options;

/** Duration conflation defaults */
export const DURATION_CONFLATION = {
  minSize: 5,
  maxSize: 5,
  maxEffectSize: 0.05,
  exclusionMethod: 'slowest' as 'slowest' | 'outliers',
} as const satisfies import('./conflations.js').duration.Options;
