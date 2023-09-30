import { array, Indexable, quantity, stats, Status, typeid } from '@repris/base';

import * as ann from '../annotators.js';
import { duration, Sample } from '../samples.js';
import * as conflations from '../conflations.js';

const SampleAnnotations = Object.freeze({
  /** Minimum value of the sample KDE where the density function is globally maximized */
  kdeMode: 'sample:kde:mode' as typeid,

  /** Optimum bandwidth for the sample */
  kdeBandwidth: 'sample:kde:bandwidth' as typeid,

  /**
   * A coefficient derived from the Full width at half maximum (FWHM) of the
   * empirical PDF located at the mode
   */
  kdeDispersion: 'sample:kde:dispersion' as typeid,

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

const ConflationAnnotations = Object.freeze({
  /**
   * Minimum value of the conflation of samples where the density estimation
   * function is globally maximized
   */
  kdeMode: 'conflation:kde' as typeid,

  hsmMode: 'conflation:hsm' as typeid,

  hsmCIRel: {
    id: 'conflation:hsm:ci-rme' as typeid,
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
    const kdeResult = kdeMode(xs, sample.summary());

    const result = new Map<typeid, ann.Annotation>([
      [SampleAnnotations.kdeMode, kdeResult.mode],
      [SampleAnnotations.kdeBandwidth, kdeResult.cvBandwidth],
      [SampleAnnotations.kdeDispersion, kdeResult.dispersion / kdeResult.mode],
    ]);

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

const conflationAnnotator: ann.Annotator = {
  annotations() {
    return Object.values(ConflationAnnotations).map(x => (typeof x === 'object' ? x.id : x));
  },

  annotate(
    conflation: conflations.Conflation<Sample<unknown>>,
    request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (!conflation.ready()) {
      return Status.value(void 0);
    }

    // run pooled analysis only on the best samples
    const samplingDist = conflation.samplingDistribution?.();

    if (samplingDist && samplingDist?.length > 0) {
      const result = new Map<typeid, ann.Annotation>();

      // HSM statistics on the sampling distribution
      if (
        request.has(ConflationAnnotations.hsmMode) ||
        request.has(ConflationAnnotations.hsmCIRel.id)
      ) {
        const opts = {
          ...ConflationAnnotations.hsmCIRel.opts,
          ...request.get(ConflationAnnotations.hsmCIRel.id),
        };

        array.sort(samplingDist);

        const hsm = stats.mode.hsm(samplingDist);
        result.set(ConflationAnnotations.hsmMode, conflation.asQuantity(hsm.mode));

        if (request.has(ConflationAnnotations.hsmCIRel.id)) {
          const smoothing = hsmBootstrapSmoothing(samplingDist, opts.smoothing);
          const hsmCI = stats.bootstrap.confidenceInterval(samplingDist,
            xs => stats.mode.hsm(xs).mode,
            opts.level,
            opts.resamples,
            smoothing
          );

          result.set(ConflationAnnotations.hsmCIRel.id, stats.rme(hsmCI, hsm.mode));
        }
      }

      // KDE statistics
      if (request.has(ConflationAnnotations.kdeMode)) {
        const os = stats.online.Gaussian.fromValues(samplingDist);
        const mode = kdeMode(samplingDist, os);
        result.set(ConflationAnnotations.kdeMode, mode.mode);
      }

      return Status.value(ann.DefaultBag.from(result));
    }

    return Status.value(void 0);
  },
};

ann.register('@annotator:conflation:mode', conflationAnnotator);
ann.register('@annotator:samples:mode', sampleAnnotator);

interface KDEAnalysis {
  /** value where the density function is globally maximized */
  mode: number;

  /** Bandwidth used in the KDE, calculated with cross-validation */
  cvBandwidth: number;

  /** Number of modes which have the maximum density */
  ties: number;

  /** The full-width of the half-sample located at the mode */
  dispersion: number;
}

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

function kdeMode(
  sample: Indexable<number>,
  summary: stats.online.SimpleSummary<number>
): KDEAnalysis {
  // MISE-optimized bandwidth
  const h = stats.kde.cvBandwidth(sample, summary.std());

  // find the mode
  const [maxi, _, ties] = stats.kde.findMaxima(stats.kde.gaussian, sample, h);

  // measure the dispersion
  const mode = sample[maxi];
  const dispersion = stats.kde.fwhm(stats.kde.gaussian, sample, mode, h);

  return {
    mode,
    ties,
    dispersion: dispersion.std,
    cvBandwidth: h,
  };
}


function concatSamples(samples: (readonly [Float64Array, Sample<unknown>])[]) {
  const N = samples.reduce((acc, [raw]) => acc + raw.length, 0);
  const concatSample = new Float64Array(N);

  for (let i = 0, off = 0; i < samples.length; i++) {
    const [raw] = samples[i];
    concatSample.set(raw, off);
    off += raw.length;
  }

  return concatSample;
}

function kdeModeConflation(samples: (readonly [Float64Array, Sample<unknown>])[]) {
  // MISE-optimized bandwidth
  const hs: [raw: Float64Array, h: number][] = [];

  for (let i = 0; i < samples.length; i++) {
    const [raw, _] = samples[i];
    const os = stats.online.Gaussian.fromValues(raw);
    const h = stats.kde.cvBandwidth(raw, os.std());

    hs.push([raw, h]);
  }

  // find the mode
  const [mode] = stats.kde.findConflationMaxima(stats.kde.gaussian, hs);

  return mode;
}
