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
      min: 1_000,
      max: 15_000,
    },

    sampleSize: {
      min: 30,
      max: 10_000,
    },
  } as const satisfies import('./samplers.js').stopwatch.Options,
};
