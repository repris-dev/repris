import { stats, Status, typeid } from '@repris/base';

import * as ann from '../annotators.js';
import * as digests from '../digests.js';
import { Sample } from '../samples.js';

const DigestAnnotations = Object.freeze({
  /** The mean of the sampling distribution */
  mean: 'digest:mean' as typeid,

  /** confidence interval of the mean */
  meanCI: {
    id: 'digest:mean:ci' as typeid,
    opts: { level: 0.95, resamples: 1000, smoothing: 0 },
  },
});

ann.register('@annotator:digest:mean', {
  annotations() {
    return Object.values(DigestAnnotations).map(x => (typeof x === 'object' ? x.id : x));
  },

  annotate(
    digest: digests.Digest<Sample<unknown>>,
    request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    const result = new Map<typeid, ann.Annotation>();
    const xs = digest.samplingDistribution?.();

    if (xs !== void 0 && xs.length > 0) {
      const os = stats.online.Gaussian.fromValues(xs);

      result.set(DigestAnnotations.mean, digest.asQuantity(os.mean()));

      if (request.has(DigestAnnotations.meanCI.id)) {
        const opts = {
          ...DigestAnnotations.meanCI.opts,
          ...request.get(DigestAnnotations.meanCI.id),
        };

        const smoothing = stats.kde.silvermansRule(os.std(), xs.length) * opts.smoothing;
        const ci = stats.bootstrap.confidenceInterval(
          xs,
          stats.centralTendency.mean,
          opts.level,
          opts.resamples,
          smoothing,
        );

        result.set(DigestAnnotations.meanCI.id, stats.rme(ci, os.mean()));
      }
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});
