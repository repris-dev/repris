import { array, Indexable, quantity, stats, Status, typeid } from '@repris/base';

import * as ann from '../annotators.js';
import { duration, Sample } from '../samples.js';
import * as digests from '../digests.js';

const SampleAnnotations = Object.freeze({
  /** Sample shorth robust mode estimator */
  shorth: {
    id: 'sample:shorth' as typeid,
    opts: { fraction: 0.33 },
  },

  shorthDispersion: 'shorth:dispersion' as typeid,

  /** Least Median of Squares (LMS) robust mode estimator */
  lms: {
    id: 'sample:lms' as typeid,
    opts: { fraction: 0.33 },
  },

  /** Quartile coefficient of dispersion (QCD) of the sample window containing the mode */
  lmsDispersion: 'sample:lms:dispersion' as typeid,

  /** Half-sample mode, D. Bickel */
  hsm: 'sample:hsm' as typeid,

  /** Quartile coefficient of dispersion (QCD) of the sample window containing the mode */
  hsmDispersion: 'sample:hsm:dispersion' as typeid,

  /**
   * The relative margin-of-error of the HSM confidence interval.
   * The RME is the half-width of the confidence interval divided by the
   * estimated HSM.
   */
  hsmCIRel: {
    id: 'sample:hsm:ci-rme' as typeid,
    opts: { level: 0.95, resamples: 500, smoothing: 0 },
  },
});

const DigestAnnotations = Object.freeze({
  hsmMode: 'digest:hsm' as typeid,

  hsmCIRel: {
    id: 'digest:hsm:ci-rme' as typeid,
    opts: { level: 0.95, resamples: 500, smoothing: 0 },
  },
});

const sampleAnnotator: ann.Annotator = {
  annotations() {
    return Object.values(SampleAnnotations).map(x => (typeof x === 'object' ? x.id : x));
  },

  annotate(
    sample: Sample<unknown>,
    request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (!duration.Duration.is(sample)) {
      return Status.value(void 0);
    }

    const xs = sample.values('f64')!;
    const result = new Map<typeid, ann.Annotation>([]);

    if (request.has(SampleAnnotations.shorth.id)) {
      const opts = {
        ...SampleAnnotations.shorth.opts,
        ...request.get(SampleAnnotations.shorth.id),
      };
      const shorth = stats.mode.shorth(xs, opts.fraction);

      result.set(SampleAnnotations.shorth.id, shorth.mode);
      result.set(SampleAnnotations.shorthDispersion, shorth.variation);
    }

    if (request.has(SampleAnnotations.lms.id)) {
      const opts = {
        ...SampleAnnotations.lms.opts,
        ...request.get(SampleAnnotations.lms.id),
      };

      const lms = stats.mode.lms(xs, opts.fraction);
      result.set(SampleAnnotations.lms.id, lms.mode);
      result.set(SampleAnnotations.lmsDispersion, lms.variation);
    }

    if (request.has(SampleAnnotations.hsm)) {
      const hsm = stats.mode.hsm(xs);

      result.set(SampleAnnotations.hsm, sample.asQuantity(hsm.mode));
      result.set(SampleAnnotations.hsmDispersion, hsm.variation);

      if (request.has(SampleAnnotations.hsmCIRel.id)) {
        const opts = {
          ...SampleAnnotations.hsmCIRel.opts,
          ...request.get(SampleAnnotations.hsmCIRel.id),
        };
        
        array.sort(xs);

        const smoothing = hsmBootstrapSmoothing(xs, opts.smoothing);
        const hsmCI = stats.bootstrap.confidenceInterval(xs,
          xs => stats.mode.hsm(xs).mode,
          opts.level,
          opts.resamples,
          smoothing
        );

        result.set(
          SampleAnnotations.hsmCIRel.id,
          quantity.create('percent', stats.rme(hsmCI, hsm.mode))
        );
      }
    }

    return Status.value(ann.DefaultBag.from(result));
  },
};

const digestAnnotator: ann.Annotator = {
  annotations() {
    return Object.values(DigestAnnotations).map(x => (typeof x === 'object' ? x.id : x));
  },

  annotate(
    digest: digests.Digest<Sample<unknown>>,
    request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (!digest.ready()) {
      return Status.value(void 0);
    }

    // run pooled analysis only on the best samples
    const samplingDist = digest.samplingDistribution?.();

    if (samplingDist && samplingDist?.length > 0) {
      const result = new Map<typeid, ann.Annotation>();

      // HSM statistics on the sampling distribution
      if (
        request.has(DigestAnnotations.hsmMode) ||
        request.has(DigestAnnotations.hsmCIRel.id)
      ) {
        const opts = {
          ...DigestAnnotations.hsmCIRel.opts,
          ...request.get(DigestAnnotations.hsmCIRel.id),
        };

        array.sort(samplingDist);

        const hsm = stats.mode.hsm(samplingDist);
        result.set(DigestAnnotations.hsmMode, digest.asQuantity(hsm.mode));

        if (request.has(DigestAnnotations.hsmCIRel.id)) {
          const smoothing = hsmBootstrapSmoothing(samplingDist, opts.smoothing);
          const hsmCI = stats.bootstrap.confidenceInterval(samplingDist,
            xs => stats.mode.hsm(xs).mode,
            opts.level,
            opts.resamples,
            smoothing
          );

          result.set(DigestAnnotations.hsmCIRel.id, stats.rme(hsmCI, hsm.mode));
        }
      }

      return Status.value(ann.DefaultBag.from(result));
    }

    return Status.value(void 0);
  },
};

ann.register('@annotator:digest:modal-interval', digestAnnotator);
ann.register('@annotator:samples:modal-interval', sampleAnnotator);

/**
 * Bootstrap smoothing. This is especially important when bootstrapping
 * confidence intervals of rank-based point estimates (median, HSM, etc.)
 * since these tend to produce non-normal sampling distributions.
 * However, an optimal smoothing parameter is hard to calculate. Instead
 * it is estimated here.
 */
function hsmBootstrapSmoothing(xs: Indexable<number>, level: number) {
  if (level <= 0) return 0;
  // Estimate standard deviation from a proportion of the sample
  const std = stats.mode.estimateStdDev(xs, .66);
  // Use Scott's estimate
  return stats.kde.silvermansRule(std, xs.length);
}
