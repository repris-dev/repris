import { stats, Status, typeid } from '@sampleci/base';
import * as ann from '../annotators.js';
import { Duration, Sample } from '../samples.js';

const Annotations = {
  median: 'median' as typeid,

  /** Inter-quartile range of the sample */
  iqr: 'median:iqr' as typeid,

  /**
   * Quartile coefficient of dispersion
   * https://en.wikipedia.org/wiki/Quartile_coefficient_of_dispersion
   */
  qcd: 'median:qcd' as typeid,
};

const annotator = {
  name: '@percentile:annotator',

  annotations() {
    return Object.values(Annotations);
  },

  annotate(
    sample: Sample<unknown>,
    request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (this.annotations().findIndex(id => request.has(id)) < 0) {
      return Status.value(void 0);
    }

    if (sample[typeid] !== Duration[typeid] as typeid) {
      return Status.value(void 0);
    }

    const d = sample as Duration;
    const data = d.toF64Array();
    const iqr = stats.iqr(data);

    const result = new Map<typeid, ann.Annotation>([
      [Annotations.median, stats.median(data)],
      [Annotations.iqr, iqr],
      [Annotations.qcd, stats.qcd(iqr)],
    ]);

    return Status.value({ annotations: result, name: annotator.name });    
  }
}

ann.register(annotator.name, annotator);