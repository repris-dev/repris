import { Indexable, stats, Status, typeid } from '@sampleci/base';
import * as ann from '../annotators.js';
import { Duration, Sample } from '../samples.js';

export interface KDEAnalysis {
  /** value where the density function is globally maximized */
  mode: number;

  /** Number of modes which have the maximum density */
  ties: number;

  /** The proportion of the sample within a proportion of the mode */
  dispersion: number;
}

function kdeMode(
  sample: Indexable<number>,
  summary: stats.SimpleSummary<number>,
): KDEAnalysis {
  const h = stats.kde.cvBandwidth(sample, summary.std());

  // find the mode
  const [maxi,, ties] = stats.kde.findMaxima(
    stats.kde.gaussian, sample, h
  );

  // measure the dispersion
  const mode = sample[maxi];
  const dispersion = stats.kde.fwhm(stats.kde.gaussian, sample, mode, h);

  return {
    mode,
    ties,
    dispersion: dispersion.std
  }
}

const Annotations = {
  /** Minimum value of the sample KDE where the density function is globally maximized */
  kdeMode: 'mode:kde' as typeid,

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
    opts: { fraction: .33 }
  },

  /** Number of modes in the mode estimation the same maximum probability */
  shorthModeCount: 'mode:shorth:count' as typeid,
  
  shorthDispersion: 'mode:shorth:dispersion' as typeid,

  /** Least Median of Squares (LMS) robust mode estimator */
  lms: {
    id: 'mode:lms' as typeid,
    opts: { fraction: .33 }
  },

  /** Number of modes in the mode estimation the same maximum probability */
  lmsModeCount: 'mode:lms:count' as typeid,

  /** Quartile coefficient of dispersion (QCD) of the sample window containing the mode */
  lmsDispersion: 'mode:lms:dispersion' as typeid,

  /** Half-sample mode, D. Bickel */
  hsm: 'mode:hsm' as typeid,
};

const annotator = {
  name: '@kde:annotator',

  annotations() {
    return Object.values(Annotations).map(
      x => typeof x === 'object' ? x.id : x
    );
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
    const kdeResult = kdeMode(data, d.summary());

    const result = new Map<typeid, ann.Annotation>([
      [Annotations.kdeMode, kdeResult.mode],
      [Annotations.kdeModeCount, kdeResult.ties],
      [Annotations.kdeDispersion, kdeResult.dispersion / kdeResult.mode],
    ]);

    if (request.has(Annotations.shorth.id)) {
      const opts = Object.assign(
        {}, Annotations.shorth.opts, request.get(Annotations.shorth.id)
      )!;

      const shorth = stats.mode.shorth(data, opts.fraction);
      result.set(Annotations.shorth.id, shorth.mode);
      result.set(Annotations.shorthModeCount, shorth.ties);
      result.set(Annotations.shorthDispersion, shorth.variation);
    }

    if (request.has(Annotations.lms.id)) {
      const opts = Object.assign(
        {}, Annotations.lms.opts, request.get(Annotations.lms.id)
      )!;

      const lms = stats.mode.lms(data, opts.fraction);
      result.set(Annotations.lms.id, lms.mode);
      result.set(Annotations.lmsModeCount, lms.ties);
      result.set(Annotations.lmsDispersion, lms.variation);
    }

    if (request.has(Annotations.hsm)) {
      const hsm = stats.mode.hsm(data);
      result.set(Annotations.hsm, hsm.mode);
    }

    return Status.value({ annotations: result, name: annotator.name });    
  }
}

ann.register(annotator.name, annotator);
