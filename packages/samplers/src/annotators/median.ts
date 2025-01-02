import { stats, Status, typeid } from '@repris/base';
import * as digests from '../digests.js';
import * as ann from '../annotators.js';
import * as samples from '../samples.js';

export const Annotations = Object.freeze({
  median: 'sample:median' as typeid,

  /** Inter-quartile range of the sample */
  iqr: 'sample:iqr' as typeid,

  /**
   * Quartile coefficient of dispersion
   * https://en.wikipedia.org/wiki/Quartile_coefficient_of_dispersion
   */
  qcd: 'sample:qcd' as typeid,
});

const DigestAnnotations = Object.freeze({
  /** The median of the sampling distribution */
  median: 'digest:median' as typeid,
});

ann.register('@annotator:sample:median', {
  annotations() {
    return Object.values(Annotations);
  },

  annotate(
    sample: samples.Sample<unknown>,
    _request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    if (!samples.duration.Duration.is(sample)) {
      return Status.value(void 0);
    }

    const data = sample.values('f64')!;
    const iqr = stats.iqr(data);

    const bag = ann.DefaultBag.from([
      [Annotations.median, stats.median(data)],
      [Annotations.iqr, iqr],
      [Annotations.qcd, stats.qcd(iqr)],
    ]);

    return Status.value(bag);
  },
});

ann.register('@annotator:digest:median', {
  annotations() {
    return Object.values(DigestAnnotations);
  },

  annotate(
    digest: digests.Digest<samples.Sample<unknown>>,
    _request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    const result = new Map<typeid, ann.Annotation>();
    const xs = digest.samplingDistribution?.();

    if (xs !== void 0 && xs.length > 0) {
      const m = stats.median(xs);
      result.set(DigestAnnotations.median, digest.asQuantity(m));
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});
