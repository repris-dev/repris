import { stats, Status, typeid } from '@repris/base';

import * as ann from '../annotators.js';
import * as digests from '../digests.js';
import { Sample } from '../samples.js';
import { hypothesis } from '../index.js';

const DigestAnnotations = Object.freeze({
  /** The mean of the sampling distribution */
  mean: 'digest:mean' as typeid,

  /** confidence interval of the mean */
  meanCI: {
    id: 'digest:mean:ci' as typeid,
    opts: { level: 0.95, resamples: 500, smoothing: 0 },
  },
});

const HypothesisAnnotations = Object.freeze({
  /** The relative change between the two samples */
  relativeDifference: 'hypothesis:mean:difference' as typeid,

  /**
   * Whether the difference is statistically significant.
   * Note that this annotation is dependant on 'hypothesis:mean:difference-ci'.
   */
  significantDifference: 'hypothesis:mean:significant-difference' as typeid,

  /** Confidence interval of the difference of means between the two samples */
  differenceCI: {
    id: 'hypothesis:mean:difference-ci' as typeid,
    opts: { level: 0.99, resamples: 5000, secondaryResamples: 50 },
  },

  /** A text summary of the difference */
  differenceSummary: 'hypothesis:mean:summary-text' as typeid,
});

ann.register('@annotator:digest:mean', {
  annotations() {
    return Object.values(DigestAnnotations).map(x => (typeof x === 'object' ? x.id : x));
  },

  annotate(
    digest: digests.Digest<Sample<unknown>>,
    request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    const result = new Map<typeid, ann.Annotation>();
    const xs = digest.samplingDistribution?.();

    if (xs !== void 0 && xs.length > 0) {
      const os = stats.online.Gaussian.fromValues(xs);

      result.set(DigestAnnotations.mean, digest.asQuantity(os.mean()));

      if (request.has(DigestAnnotations.meanCI.id)) {
        const opts = {
          ...DigestAnnotations.meanCI.opts,
          ...request.get(DigestAnnotations.meanCI.id),
        };

        const smoothing = stats.kde.silvermansRule(os.std(), xs.length) * opts.smoothing;
        const ci = stats.bootstrap.confidenceInterval(
          xs,
          stats.centralTendency.mean,
          opts.level,
          opts.resamples,
          smoothing,
        );

        result.set(DigestAnnotations.meanCI.id, stats.rme(ci, os.mean()));
      }
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});

ann.register('@annotator:hypothesis:mean', {
  annotations() {
    return Object.values(HypothesisAnnotations).map(x => (typeof x === 'object' ? x.id : x));
  },

  annotate(
    hypot: hypothesis.DefaultHypothesis<digests.Digest<Sample<unknown>>>,
    request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    if (!hypothesis.DefaultHypothesis.is(hypot)) {
      return Status.value(void 0);
    }

    const mean = stats.centralTendency.mean;
    const result = new Map<typeid, ann.Annotation>();

    const [c0, c1] = hypot.operands();
    const x0 = c0.samplingDistribution?.();
    const x1 = c1.samplingDistribution?.();

    if (x0 === void 0 || x1 === void 0) {
      return Status.err('Samples must have a sampling distribution');
    }

    const mean0 = mean(x0);
    const mean1 = mean(x1);
    const relChange = (mean0 - mean1) / mean1;

    result.set(HypothesisAnnotations.relativeDifference, relChange);

    let ci: [lo: number, hi: number] | undefined;

    // hsm difference confidence intervals
    if (request.has(HypothesisAnnotations.differenceCI.id)) {
      const opts = {
        ...HypothesisAnnotations.differenceCI.opts,
        ...request.get(HypothesisAnnotations.differenceCI.id),
      };

      ci = stats.bootstrap.studentizedDifferenceTest(
        x0,
        x1,
        (x0, x1) => mean(x0) - mean(x1),
        opts.level,
        opts.resamples,
        opts.secondaryResamples,
      );

      result.set(HypothesisAnnotations.differenceCI.id, ci);
    }

    // summary of the difference
    if (request.has(HypothesisAnnotations.differenceSummary)) {
      const fmt = new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 });
      let summary = (relChange > 0 ? '+' : '') + fmt.format(relChange * 100) + '%';

      if (ci) {
        const lo = ci[0] / mean1;
        const hi = ci[1] / mean1;

        summary += ` (${fmt.format(lo * 100)}, ${fmt.format(hi * 100)})`;
      }

      result.set(HypothesisAnnotations.differenceSummary, summary);
    }

    if (request.has(HypothesisAnnotations.significantDifference)) {
      if (ci) {
        // Accept the null hypothesis (no difference) if the interval
        // includes 0, otherwise reject
        const reject = (relChange > 0 && ci[0] > 0) || (relChange < 0 && ci[1] < 0);
        result.set(HypothesisAnnotations.significantDifference, reject ? relChange : 0);
      }
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});
