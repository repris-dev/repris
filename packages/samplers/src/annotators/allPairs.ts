import { stats, Status, typeid } from '@repris/base';

import * as ann from '../annotators.js';
import { Sample } from '../samples.js';

const Annotations = {
  /** Nonparametric measure of spread */
  qn: 'allPairs:scale:qn' as typeid,

  /** Nonparametric measure of spread */
  sn: 'allPairs:scale:sn' as typeid,
};

ann.register('@allPairs:annotator', {
  annotations() {
    return Object.values(Annotations);
  },

  annotate(
    sample: Sample<unknown>,
    request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    const data = sample.values('f64')!;
    const result = new Map<typeid, ann.Annotation>();

    if (request.has(Annotations.qn)) {
      const qn = stats.allPairs.crouxQn(data);
      result.set(Annotations.qn, qn.correctedSpread);
    }

    if (request.has(Annotations.sn)) {
      const sn = stats.allPairs.crouxSn(data);
      result.set(Annotations.sn, sn.correctedSpread);
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});
