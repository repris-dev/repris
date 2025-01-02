import { stats, Status, typeid } from '@repris/base';

import * as ann from '../annotators.js';
import * as digests from '../digests.js';
import { Sample } from '../samples.js';
import * as hypothesis from '../hypothesis.js';

const DigestAnnotations = Object.freeze({
  /** The mean of the sampling distribution */
  mean: 'digest:mean' as typeid,

  /** Minimum detectable effect size */
  mdes: {
    id: 'digest:mdes' as typeid,
    opts: { power: 0.8 },
  },

  /** confidence interval of the mean */
  meanRME: {
    id: 'digest:mean:rme' as typeid,
    opts: { level: 0.95, resamples: 5000, smoothing: 0 },
  },
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

      if (request.has(DigestAnnotations.meanRME.id)) {
        const opts = {
          ...DigestAnnotations.meanRME.opts,
          ...request.get(DigestAnnotations.meanRME.id),
        };

        const smoothing = stats.kde.silvermansRule(os.std(), xs.length) * opts.smoothing;
        const [lo, hi] = stats.bootstrap.confidenceInterval(
          xs,
          stats.centralTendency.mean,
          opts.level,
          opts.resamples,
          smoothing,
        );

        result.set(DigestAnnotations.meanRME.id, stats.rme([lo, hi], os.mean()));
      }
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});

const HypothesisAnnotations = Object.freeze({
  /**
   * The relative change between the mean of two samples. This can also
   * denote the relative effect-size of the difference, if its statistically
   * significant.
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
   * The (hedges-g) effect-size of the difference in means of the two samples.
   */
  effectSize: 'hypothesis:mean:effect-size' as typeid,

  /**
   * Whether the difference is meaningful, not just statistically significant.
   * The threshold can be set with the 'minimumEffectSize' option.
   */
  meaningfulDifference: {
    id: 'hypothesis:mean:meaningful-difference' as typeid,
    opts: { minimumEffectSize: 0.8, type: 'hedges-g' },
  },

  /** Confidence interval of the difference of means between the two samples */
  differenceCI: {
    id: 'hypothesis:mean:difference-ci' as typeid,
    opts: { level: 0.99, resamples: 5000, secondaryResamples: 75 },
  },

  /** A text summary of the difference of two means */
  differenceSummary: 'hypothesis:mean:summary-text' as typeid,
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

    const result = new Map<typeid, ann.Annotation>();

    const [c0, c1] = hypot.operands();
    const x0 = c0.samplingDistribution?.();
    const x1 = c1.samplingDistribution?.();

    if (x0 === void 0 || x1 === void 0) {
      return Status.err('Samples must have a sampling distribution');
    }

    const stat0 = stats.online.Gaussian.fromValues(x0);
    const stat1 = stats.online.Gaussian.fromValues(x1);

    let relChange = (stat0.mean() - stat1.mean()) / stat1.mean();
    let boot: stats.bootstrap.StudentizedDifferenceResult | undefined;
    let rejectH0 = false;

    // The main difference test
    if (request.has(HypothesisAnnotations.differenceCI.id)) {
      const opts = {
        ...HypothesisAnnotations.differenceCI.opts,
        ...request.get(HypothesisAnnotations.differenceCI.id),
      };

      boot = stats.bootstrap.studentizedDifferenceTest(
        x0,
        x1,
        (x0, x1) => stats.centralTendency.mean(x0) - stats.centralTendency.mean(x1),
        opts.level,
        opts.resamples,
        opts.secondaryResamples,
        void 0,
        true /* bias correction */,
      );

      const [lo, hi] = boot.interval;

      // Accept the null hypothesis (no difference) if the interval
      // includes 0, otherwise reject
      rejectH0 = lo > 0 || hi < 0;
      result.set(HypothesisAnnotations.differenceCI.id, boot.interval);
    }

    // summary of the difference
    if (request.has(HypothesisAnnotations.differenceSummary)) {
      const fmt = new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 });
      let summary = (relChange > 0 ? '+' : '') + fmt.format(relChange * 100) + '%';

      if (boot) {
        const lo = boot.interval[0] / stat1.mean();
        const hi = boot.interval[1] / stat1.mean();

        summary += ` (${fmt.format(lo * 100)}, ${fmt.format(hi * 100)})`;
      }

      result.set(HypothesisAnnotations.differenceSummary, summary);
    }

    // report the relative difference
    result.set(HypothesisAnnotations.relativeDifference, relChange);

    // report statistical significance
    if (request.has(HypothesisAnnotations.significantDifference.id)) {
      result.set(HypothesisAnnotations.significantDifference.id, rejectH0 ? relChange : 0);
    }

    // report effect-size
    const es = stats.hedgesG(
      stat0.N(),
      stat0.mean(),
      stat0.std(),
      stat1.N(),
      stat1.mean(),
      stat1.std(),
    );

    if (request.has(HypothesisAnnotations.effectSize)) {
      result.set(HypothesisAnnotations.effectSize, es);
    }

    // report meaningful difference according to power analysis
    if (request.has(HypothesisAnnotations.meaningfulDifference.id)) {
      const opts = {
        ...HypothesisAnnotations.meaningfulDifference.opts,
        ...request.get(HypothesisAnnotations.meaningfulDifference.id),
      };

      if (rejectH0) {
        result.set(HypothesisAnnotations.meaningfulDifference.id, es >= opts.minimumEffectSize);
      }
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});
