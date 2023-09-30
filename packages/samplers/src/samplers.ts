export * from './samplers/types.js';
export * as stopwatch from './samplers/stopwatch.js';

export const defaults = {
  stopwatch: {
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
  } as const satisfies import('./samplers.js').stopwatch.Options,
};
