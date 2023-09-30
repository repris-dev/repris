import { array, stats, Status, typeid } from '@repris/base';

import * as ann from '../annotators.js';
import { duration, Sample } from '../samples.js';

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

const sampleAnnotator: ann.Annotator = {
  annotations() {
    return Object.values(SampleAnnotations);
  },

  annotate(
    sample: Sample<unknown>,
    _request: Map<typeid, {}>,
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

function kdeMode(
  sample: array.ArrayView<number>,
  summary: stats.online.SimpleSummary<number>,
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
