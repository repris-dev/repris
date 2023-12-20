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
  /**
   * The relative change between the mean of two samples. This can also
   * denote the effect-size of the difference.
   */
  relativeDifference: 'hypothesis:mean:difference' as typeid,

  /**
   * Whether the difference is statistically significant.
   * If the difference is not significant, the value of this annotation is zero,
   * otherwise the value is equal to the relative difference.
   *
   * Note that this annotation is dependant on 'hypothesis:mean:difference-ci'.
   */
  significantDifference: {
    id: 'hypothesis:mean:significant-difference' as typeid,
  },

  /**
   * 
   */
  meaningfulDifference: {
    id: 'hypothesis:mean:meaningful-difference' as typeid,
    opts: { minimumEffectSize: 0 },
  },

  /** Confidence interval of the difference of means between the two samples */
  differenceCI: {
    id: 'hypothesis:mean:difference-ci' as typeid,
    opts: { level: 0.999, resamples: 2500, secondaryResamples: 50 },
  },

  /** An estimate of the statistical power of the test */
  power: 'hypothesis:mean:power' as typeid,

  /** Cohen's d standardized effect-size of the difference in means between the two samples */
  effectSize: 'hypothesis:mean:effect-size' as typeid,

  /** A text summary of the difference of two means */
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

    const os0 = stats.online.Gaussian.fromValues(x0);
    const os1 = stats.online.Gaussian.fromValues(x1);
    
    const relChange = (os0.mean() - os1.mean()) / os1.mean();
    result.set(HypothesisAnnotations.relativeDifference, relChange);

    let boot: stats.bootstrap.StudentizedDifferenceResult | undefined;

    // hsm difference confidence intervals/power
    if (
      request.has(HypothesisAnnotations.differenceCI.id) ||
      request.has(HypothesisAnnotations.power)
    ) {
      const opts = {
        ...HypothesisAnnotations.differenceCI.opts,
        ...request.get(HypothesisAnnotations.differenceCI.id),
      };

      boot = stats.bootstrap.studentizedDifferenceTest(
        x0,
        x1,
        (x0, x1) => mean(x0) - mean(x1),
        opts.level,
        opts.resamples,
        opts.secondaryResamples,
        void 0,
        true /* bias correction */
      );

      result.set(HypothesisAnnotations.differenceCI.id, boot.interval);
      result.set(HypothesisAnnotations.power, boot.power);
    }

    if (request.has(HypothesisAnnotations.effectSize)) {
      const d = stats.cohensD(os0.N(), os0.mean(), os0.std(1), os1.N(), os1.mean(), os1.std(1));
      result.set(HypothesisAnnotations.effectSize, d);
    }

    // summary of the difference
    if (request.has(HypothesisAnnotations.differenceSummary)) {
      const fmt = new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 });
      let summary = (relChange > 0 ? '+' : '') + fmt.format(relChange * 100) + '%';

      if (boot) {
        const lo = boot.interval[0] / os1.mean();
        const hi = boot.interval[1] / os1.mean();

        summary += ` (${fmt.format(lo * 100)}, ${fmt.format(hi * 100)})`;
      }

      result.set(HypothesisAnnotations.differenceSummary, summary);
    }

    if (request.has(HypothesisAnnotations.significantDifference.id)) {
      if (boot) {
        const [lo, hi] = boot.interval;

        // Accept the null hypothesis (no difference) if the interval
        // includes 0, otherwise reject
        let rejectH0 = lo > 0 || hi < 0;

        // (Relative) effect-size must be larger than the minimum
//        reject = reject && Math.abs(relChange) > opts.minimumEffectSize;

        result.set(HypothesisAnnotations.significantDifference.id, rejectH0 ? relChange : 0);
      }
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});
