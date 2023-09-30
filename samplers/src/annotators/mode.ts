import { Indexable, stats, Status, typeid } from '@sampleci/base';
import * as ann from '../annotators.js';
import { Duration, Sample, Conflation, DurationConflation } from '../samples.js';

const SampleAnnotations = {
  /** Minimum value of the sample KDE where the density function is globally maximized */
  kdeMode: 'mode:kde' as typeid,

  /** Optimum bandwidth for the sample */
  kdeBandwidth: 'mode:kde:bandwidth' as typeid,

  /** Number of modes in the sample KDE of the same maximum probability */
  kdeModeCount: 'mode:kde:count' as typeid,

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

  /** Number of modes in the mode estimation the same maximum probability */
  shorthModeCount: 'mode:shorth:count' as typeid,

  shorthDispersion: 'mode:shorth:dispersion' as typeid,

  /** Least Median of Squares (LMS) robust mode estimator */
  lms: {
    id: 'mode:lms' as typeid,
    opts: { fraction: 0.33 },
  },

  /** Number of modes in the mode estimation the same maximum probability */
  lmsModeCount: 'mode:lms:count' as typeid,

  /** Quartile coefficient of dispersion (QCD) of the sample window containing the mode */
  lmsDispersion: 'mode:lms:dispersion' as typeid,

  /** Half-sample mode, D. Bickel */
  hsm: 'mode:hsm' as typeid,

  /** Quartile coefficient of dispersion (QCD) of the sample window containing the mode */
  hsmDispersion: 'mode:hsm:dispersion' as typeid,
};

const ConflationAnnotations = {
  /**
   * Minimum value of the conflation of samples where the density estimation
   * function is globally maximized
   */
  kdeMode: 'mode:kde:conflation' as typeid,

  hsmMode: 'mode:hsm:conflation' as typeid,
};

const sampleAnnotator: ann.Annotator = {
  annotations() {
    return Object.values(SampleAnnotations).map((x) => (typeof x === 'object' ? x.id : x));
  },

  annotate(
    sample: Sample<unknown>,
    request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (this.annotations().findIndex((id) => request.has(id)) < 0) {
      return Status.value(void 0);
    }

    if (sample[typeid] !== (Duration[typeid] as typeid)) {
      return Status.value(void 0);
    }

    const d = sample as Duration;
    const data = d.toF64Array();
    const kdeResult = kdeMode(data, d.summary());

    const result = new Map<typeid, ann.Annotation>([
      [SampleAnnotations.kdeMode, kdeResult.mode],
      [SampleAnnotations.kdeBandwidth, kdeResult.cvBandwidth],
      [SampleAnnotations.kdeModeCount, kdeResult.ties],
      [SampleAnnotations.kdeDispersion, kdeResult.dispersion / kdeResult.mode],
    ]);

    if (request.has(SampleAnnotations.shorth.id)) {
      const opts = Object.assign({}, SampleAnnotations.shorth.opts, request.get(SampleAnnotations.shorth.id))!;

      const shorth = stats.mode.shorth(data, opts.fraction);
      result.set(SampleAnnotations.shorth.id, shorth.mode);
      result.set(SampleAnnotations.shorthModeCount, shorth.ties);
      result.set(SampleAnnotations.shorthDispersion, shorth.variation);
    }

    if (request.has(SampleAnnotations.lms.id)) {
      const opts = Object.assign({}, SampleAnnotations.lms.opts, request.get(SampleAnnotations.lms.id))!;

      const lms = stats.mode.lms(data, opts.fraction);
      result.set(SampleAnnotations.lms.id, lms.mode);
      result.set(SampleAnnotations.lmsModeCount, lms.ties);
      result.set(SampleAnnotations.lmsDispersion, lms.variation);
    }

    if (request.has(SampleAnnotations.hsm)) {
      const hsm = stats.mode.hsm(data);

      result.set(SampleAnnotations.hsm, hsm.mode);
      result.set(SampleAnnotations.hsmDispersion, hsm.variation);
    }

    return Status.value(new ann.DefaultBag(result));
  },
};

ann.register('@annotator:mode', sampleAnnotator);

const conflationAnnotator: ann.Annotator = {
  annotations() {
    return Object.values(ConflationAnnotations);
  },

  annotate(
    conflation: Conflation<unknown>,
    request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (this.annotations().findIndex((id) => request.has(id)) < 0) {
      return Status.value(void 0);
    }

    if (conflation[typeid] !== DurationConflation[typeid] as typeid) {
      return Status.value(void 0);
    }

    const c = conflation as DurationConflation;
    const samples = Array.from(c.samples()).map(
      s => [s.toF64Array(), s] as [Float64Array, Duration]
    );
   
    if (samples.length > 0) {
      const kdeAnalysis = kdeModeConflation(samples);
      const hsmAnalysis = hsmConflation(samples);

      const result = new Map<typeid, ann.Annotation>([
        [ConflationAnnotations.kdeMode, kdeAnalysis.mode],
        [ConflationAnnotations.hsmMode, hsmAnalysis.mode],
      ]);
  
      return Status.value(new ann.DefaultBag(result));
    }

    return Status.value(undefined);
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

function kdeMode(
  sample: Indexable<number>,
  summary: stats.online.SimpleSummary<number>
): KDEAnalysis {
  // MISE-optimized bandwidth
  const h = stats.kde.cvBandwidth(sample, summary.std());

  // find the mode
  const [maxi, , ties] = stats.kde.findMaxima(stats.kde.gaussian, sample, h);

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
  samples: [Float64Array, Duration][]
) {
  const N = samples.reduce((acc, [raw]) => acc + raw.length, 0);
  const sample = new Float64Array(N);

  for (let i = 0, off = 0; i < samples.length; i++) {
    const [raw] = samples[i];
    sample.set(raw, off)
    off += raw.length;
  }

  return stats.mode.hsm(sample);
}

function kdeModeConflation(
  samples: [Float64Array, Duration][],
) {  
  // MISE-optimized bandwidth
  const hs: [raw: Float64Array, h: number][] = [];
  
  for (let i = 0; i < samples.length; i++) {
    const [raw, s] = samples[i];
    const h = stats.kde.cvBandwidth(raw, s.summary().std());

    hs.push([raw, h]);
  }

  // find the mode
  const [mode, d, ties] = stats.kde.findConflationMaxima(
    stats.kde.gaussian, hs
  );

  return {
    mode,
    ties,
    dispersion: 0, // dispersion.std,
  };
}