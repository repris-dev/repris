import { stats, Status, typeid } from '@sampleci/base';
import * as ann from '../annotators.js';
import * as samples from '../samples.js';

const Annotations = {
  /** */
  qn: 'allPairs:scale:qn' as typeid,

  /** */
  sn: 'allPairs:scale:sn' as typeid,
};

const annotator = {
  name: '@allPairs:annotator',

  annotations() {
    return Object.values(Annotations);
  },

  annotate(
    sample: samples.Sample<unknown>,
    request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (this.annotations().findIndex((id) => request.has(id)) < 0) {
      return Status.value(void 0);
    }

    if (sample[typeid] !== (samples.Duration[typeid] as typeid)) {
      return Status.value(void 0);
    }

    const data = (sample as samples.Duration).toF64Array();
    const result = new Map<typeid, ann.Annotation>();

    if (request.has(Annotations.qn)) {
      const qn = stats.allPairs.crouxQn(data);
      result.set(Annotations.qn, qn.correctedSpread);
    }

    if (request.has(Annotations.sn)) {
      const sn = stats.allPairs.crouxSn(data);
      result.set(Annotations.sn, sn.correctedSpread);
    }

    return Status.value(new ann.DefaultBag(result));
  },
};

ann.register(annotator.name, annotator);
