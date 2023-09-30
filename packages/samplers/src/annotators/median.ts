import { stats, Status, typeid } from '@repris/base';
import * as ann from '../annotators.js';
import * as samples from '../samples.js';

export const Annotations = {
  median: 'sample:median' as typeid,

  /** Inter-quartile range of the sample */
  iqr: 'sample:iqr' as typeid,

  /**
   * Quartile coefficient of dispersion
   * https://en.wikipedia.org/wiki/Quartile_coefficient_of_dispersion
   */
  qcd: 'sample:qcd' as typeid,
};

ann.register('@percentile:annotator', {
  annotations() {
    return Object.values(Annotations);
  },

  annotate(
    sample: samples.Sample<unknown>,
    _request: Map<typeid, {}>
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
