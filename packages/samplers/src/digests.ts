import type { typeid } from '@repris/base';

export * from './digests/types.js';
export * as duration from './digests/samplingDistribution.js';

export const defaults = {
  duration: {
    maxSize: 30,
    maxPrecision: 0.1, /** microseconds */
    locationEstimationType: 'sample:hsm' as typeid,
  } as const satisfies import('./digests/samplingDistribution.js').Options,
};
