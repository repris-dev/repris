import { Indexable, quantity, stats, Status, typeid } from '@repris/base';

import * as ann from '../annotators.js';
import { duration, Sample } from '../samples.js';
import * as conflations from '../conflations.js';

const SampleAnnotations = Object.freeze({
  /** Minimum value of the sample KDE where the density function is globally maximized */
  kdeMode: 'mode:kde' as typeid,

  /** Optimum bandwidth for the sample */
  kdeBandwidth: 'mode:kde:bandwidth' as typeid,

  /**
   * A coefficient derived from the Full width at half maximum (FWHM) of the
   * empirical PDF located at the mode
   */
  kdeDispersion: 'mode:kde:dispersion' as typeid,

  /** Sample shorth robust mode estimator */
  shorth: {
    id: 'mode:shorth' as typeid,
    opts: { fraction: 0.33 },
  },

  shorthDispersion: 'mode:shorth:dispersion' as typeid,

  /** Least Median of Squares (LMS) robust mode estimator */
  lms: {
    id: 'mode:lms' as typeid,
    opts: { fraction: 0.33 },
  },

  /** Quartile coefficient of dispersion (QCD) of the sample window containing the mode */
  lmsDispersion: 'mode:lms:dispersion' as typeid,

  /** Half-sample mode, D. Bickel */
  hsm: 'mode:hsm' as typeid,

  /** Quartile coefficient of dispersion (QCD) of the sample window containing the mode */
  hsmDispersion: 'mode:hsm:dispersion' as typeid,

  /**
   * The relative margin-of-error of the HSM confidence interval.
   * The RME is the half-width of the confidence interval divided by the
   * estimated HSM.
   */
  hsmCIRME: {
    id: 'mode:hsm:ci-rme' as typeid,
    opts: { level: 0.95, resamples: 500, smoothing: 0 },
  },
});

const ConflationAnnotations = Object.freeze({
  /**
   * Minimum value of the conflation of samples where the density estimation
   * function is globally maximized
   */
  kdeMode: 'mode:kde:conflation' as typeid,

  hsmMode: 'mode:hsm:conflation' as typeid,

  hsmCIRME: {
    id: 'mode:hsm:conflation:ci-rme' as typeid,
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
    if (this.annotations().findIndex(id => request.has(id)) < 0) {
      return Status.value(void 0);
    }

    if (!duration.Duration.is(sample)) {
      return Status.value(void 0);
    }

    const data = sample.toF64Array();
    const kdeResult = kdeMode(data, sample.summary());

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
      const shorth = stats.mode.shorth(data, opts.fraction);

      result.set(SampleAnnotations.shorth.id, shorth.mode);
      result.set(SampleAnnotations.shorthDispersion, shorth.variation);
    }

    if (request.has(SampleAnnotations.lms.id)) {
      const opts = {
        ...SampleAnnotations.lms.opts,
        ...request.get(SampleAnnotations.lms.id),
      };

      const lms = stats.mode.lms(data, opts.fraction);
      result.set(SampleAnnotations.lms.id, lms.mode);
      result.set(SampleAnnotations.lmsDispersion, lms.variation);
    }

    if (request.has(SampleAnnotations.hsm)) {
      const hsm = stats.mode.hsm(data);

      result.set(SampleAnnotations.hsm, sample.asQuantity(hsm.mode));
      result.set(SampleAnnotations.hsmDispersion, hsm.variation);

      if (request.has(SampleAnnotations.hsmCIRME.id)) {
        const opts = {
          ...SampleAnnotations.hsmCIRME.opts,
          ...request.get(SampleAnnotations.hsmCIRME.id),
        };

        const smoothing = bootstrapSmoothing(data, opts.smoothing);
        const hsmCI = stats.mode.hsmConfidence(data, opts.level, opts.resamples, smoothing);

        result.set(SampleAnnotations.hsmCIRME.id, quantity.create('percent', rme(hsmCI, hsm.mode)));
      }
    }

    return Status.value(ann.DefaultBag.from(result));
  },
};

ann.register('@annotator:mode', sampleAnnotator);

const conflationAnnotator: ann.Annotator = {
  annotations() {
    return Object.values(ConflationAnnotations).map(x => (typeof x === 'object' ? x.id : x));
  },

  annotate(
    conflation: conflations.Conflation<Sample<unknown>>,
    request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (this.annotations().findIndex(id => request.has(id)) < 0) {
      return Status.value(void 0);
    }

    if (!conflations.duration.Result.is(conflation) || !conflation.ready()) {
      return Status.value(void 0);
    }

    // run pooled analysis only on the best samples
    const samples = tof64Samples(conflation);

    if (samples.length > 0) {
      const result = new Map<typeid, ann.Annotation>();

      if (
        request.has(ConflationAnnotations.hsmMode) ||
        request.has(ConflationAnnotations.hsmCIRME.id)
      ) {
        const opts = {
          ...ConflationAnnotations.hsmCIRME.opts,
          ...request.get(ConflationAnnotations.hsmCIRME.id),
        };

        const pooledSample = concatSamples(samples);
        const smoothing = bootstrapSmoothing(pooledSample, opts.smoothing);
        const hsmAnalysis = hsmConflation(pooledSample, opts.level, opts.resamples, smoothing);

        result.set(ConflationAnnotations.hsmMode, conflation.asQuantity(hsmAnalysis.mode));

        if (request.has(ConflationAnnotations.hsmCIRME.id)) {
          result.set(ConflationAnnotations.hsmCIRME.id, hsmAnalysis.rme!);
        }
      }

      if (request.has(ConflationAnnotations.kdeMode)) {
        const kdeAnalysis = kdeModeConflation(samples);
        result.set(ConflationAnnotations.kdeMode, kdeAnalysis.mode);
      }

      return Status.value(ann.DefaultBag.from(result));
    }

    return Status.value(void 0);
  },
};

ann.register('@annotator:conflation:mode', conflationAnnotator);

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
function bootstrapSmoothing(xs: Float64Array, level: number) {
  if (level <= 0) return 0;
  // Estimate standard deviation from a proportion of the sample
  const std = stats.mode.estimateStdDev(xs, .66);
  // Use Scott's estimate
  return (std / xs.length ** (-1 / 5)) * level;
}

function tof64Samples(conflation: conflations.Conflation<duration.Duration>) {
  return conflation
    .stat()
    .filter(s => s.status === 'consistent')
    .map(s => [s.sample.toF64Array!(), s.sample] as const);
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

function hsmConflation(
  pooledSample: Indexable<number>,
  ciLevel?: number,
  resamples = 500,
  smoothing?: number
) {
  const { mode, variation } = stats.mode.hsm(pooledSample);

  return {
    mode,
    variation,
    rme:
      ciLevel !== void 0
        ? rme(stats.mode.hsmConfidence(pooledSample, ciLevel, resamples, smoothing), mode)
        : void 0,
  };
}

function concatSamples(samples: (readonly [Float64Array, duration.Duration])[]) {
  const N = samples.reduce((acc, [raw]) => acc + raw.length, 0);
  const concatSample = new Float64Array(N);

  for (let i = 0, off = 0; i < samples.length; i++) {
    const [raw] = samples[i];
    concatSample.set(raw, off);
    off += raw.length;
  }

  return concatSample;
}

function kdeModeConflation(samples: (readonly [Float64Array, duration.Duration])[]) {
  // MISE-optimized bandwidth
  const hs: [raw: Float64Array, h: number][] = [];

  for (let i = 0; i < samples.length; i++) {
    const [raw, s] = samples[i];
    const h = stats.kde.cvBandwidth(raw, s.summary().std());

    hs.push([raw, h]);
  }

  // find the mode
  const [mode] = stats.kde.findConflationMaxima(stats.kde.gaussian, hs);

  return {
    mode,
  };
}

/** Relative error */
function rme(ci: [number, number], estimate: number) {
  return (ci[1] - ci[0]) / 2 / estimate;
}
