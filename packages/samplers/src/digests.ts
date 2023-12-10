import type { typeid } from '@repris/base';

export * from './digests/types.js';
export * as duration from './digests/samplingDistribution.js';

export const defaults = {
  duration: {
    minSize: 20,
    maxSize: 30,
    requiredEffectSize: 0.1,
    powerLevel: 0.95,
    locationEstimationType: 'sample:hsm' as typeid,
  } as const satisfies import('./digests/samplingDistribution.js').Options,
};
