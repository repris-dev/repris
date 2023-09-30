import type { typeid } from '@repris/base';

export * from './conflations/types.js';
export * as duration from './conflations/samplingDistribution.js';

export const defaults = {
  duration: {
    minSize: 20,
    maxSize: 30,
    maxUncertainty: 0.025,
    locationEstimationType: 'mode:hsm' as typeid,
  } as const satisfies import('./conflations/samplingDistribution.js').Options
};
