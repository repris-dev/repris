import type { typeid } from '@repris/base';

export * from './conflations/types.js';
export * from './conflations/kruskal.js';
export * as duration from './conflations/duration.js';

export const defaults = {
  duration: {
    minSize: 20,
    maxSize: 30,
    maxUncertainty: 0.04,
    locationEstimationType: 'mode:hsm' as typeid,
  } as const satisfies import('./conflations/duration.js').Options
};
