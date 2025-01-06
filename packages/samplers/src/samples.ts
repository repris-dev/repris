export * from './samples/types.js';
export * as duration from './samples/duration.js';

export const defaults = {
  duration: {
    maxCapacity: 500,
    shortcutThreshold: 0.1,
  } as const satisfies import('./samples/duration.js').Options,
};
