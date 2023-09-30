export * from './conflations/types.js';
export * from './conflations/kruskal.js';
export * as duration from './conflations/duration.js';

export const defaults = {
  duration: {
    minSize: 5,
    maxSize: 5,
    maxEffectSize: 0.05,
    exclusionMethod: 'slowest' as 'slowest' | 'outliers',
  } as const satisfies import('./conflations/duration.js').Options
};
