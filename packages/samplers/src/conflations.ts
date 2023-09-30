export * from './conflations/types.js';
export * from './conflations/kruskal.js';
export * as duration from './conflations/duration.js';

export const defaults = {
  duration: {
    minSize: 6,
    maxSize: 40,
    maxEffectSize: 0.1,
    exclusionMethod: 'slowest' as const,
    inputOrder: 'oldestFirst',
  } as const satisfies import('./conflations/duration.js').Options
};
