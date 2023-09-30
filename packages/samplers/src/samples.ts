export * from './samples/types.js';
export * as duration from './samples/duration.js';

export const defaults = {
  duration: {
    maxCapacity: 500,
    significanceThreshold: 0.005,
  } as const satisfies import('./samples/duration.js').Options,
};
