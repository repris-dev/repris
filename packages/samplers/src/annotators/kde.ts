import { Indexable, stats, Status, typeid } from '@repris/base';

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
});

const ConflationAnnotations = Object.freeze({
  /**
   * Minimum value of the conflation of samples where the density estimation
   * function is globally maximized
   */
  kdeMode: 'conflation:kde' as typeid,
});

const sampleAnnotator: ann.Annotator = {
  annotations() {
    return Object.values(SampleAnnotations);
  },

  annotate(
    sample: Sample<unknown>,
    _request: Map<typeid, {}>
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

    return Status.value(ann.DefaultBag.from(result));
  },
};

const conflationAnnotator: ann.Annotator = {
  annotations() {
    return Object.values(ConflationAnnotations);
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

ann.register('@annotator:conflation:kde', conflationAnnotator);
ann.register('@annotator:samples:kde', sampleAnnotator);

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
