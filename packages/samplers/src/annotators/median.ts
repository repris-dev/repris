import { stats, Status, typeid, array } from '@repris/base';
import * as digests from '../digests.js';
import * as ann from '../annotators.js';
import * as samples from '../samples.js';
import * as hypothesis from '../hypothesis.js';

import { Sample } from '../samples.js';

export const Annotations = Object.freeze({
  median: 'sample:median' as typeid,

  /** Inter-quartile range of the sample */
  iqr: 'sample:iqr' as typeid,

  /**
   * Quartile coefficient of dispersion
   * https://en.wikipedia.org/wiki/Quartile_coefficient_of_dispersion
   */
  qcd: 'sample:qcd' as typeid,
});

const DigestAnnotations = Object.freeze({
  /** The median of the sampling distribution */
  median: 'digest:median' as typeid,
});

const HypothesisAnnotations = Object.freeze({
  /**
   * The relative change between the mean of two samples. This can also
   * denote the relative effect-size of the difference, if its statistically
   * significant.
   */
  relativeDifference: 'hypothesis:median:difference' as typeid,

  /**
   * Whether the difference is statistically significant.
   * If the difference is not significant, the value of this annotation is zero,
   * otherwise the value is equal to the relative difference.
   *
   * Note that this annotation is dependant on 'hypothesis:median:difference-ci'.
   */
  significantDifference: {
    id: 'hypothesis:median:significant-difference' as typeid,
  },

  /**
   * Whether the difference is meaningful, not just statistically significant.
   * The behavior can be altered by the 'minimumEffectSize' option. The default
   * value is 'auto':
   *
   * - 'auto' - The minimum effect size must be larger than the minimum-detectable
   *   effect-size (MDES) of each of the two samples in the comparison.
   *
   * - {number} - A minimum relative effect-size. e.g. a value of 0.05 would mean
   *   The minimum effect size must be at least 5% from the baseline.
   */
  meaningfulDifference: {
    id: 'hypothesis:median:meaningful-difference' as typeid,
    opts: { minimumEffectSize: 'auto' as number | 'auto' },
  },

  /** Confidence interval of the difference of means between the two samples */
  differenceCI: {
    id: 'hypothesis:median:difference-ci' as typeid,
    opts: { level: 0.99, resamples: 2500, secondaryResamples: 50 },
  },

  /** An estimate of the empirical statistical power of the test */
  power: 'hypothesis:median:power' as typeid,

  /** A text summary of the difference of two means */
  differenceSummary: 'hypothesis:median:summary-text' as typeid,
});

ann.register('@annotator:sample:median', {
  annotations() {
    return Object.values(Annotations);
  },

  annotate(
    sample: samples.Sample<unknown>,
    _request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    if (!samples.duration.Duration.is(sample)) {
      return Status.value(void 0);
    }

    const data = sample.values('f64')!;
    const iqr = stats.iqr(data);

    const bag = ann.DefaultBag.from([
      [Annotations.median, stats.median(data)],
      [Annotations.iqr, iqr],
      [Annotations.qcd, stats.qcd(iqr)],
    ]);

    return Status.value(bag);
  },
});

ann.register('@annotator:digest:median', {
  annotations() {
    return Object.values(DigestAnnotations);
  },

  annotate(
    digest: digests.Digest<samples.Sample<unknown>>,
    _request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    const result = new Map<typeid, ann.Annotation>();
    const xs = digest.samplingDistribution?.();

    if (xs !== void 0 && xs.length > 0) {
      const m = stats.median(xs);
      result.set(DigestAnnotations.median, digest.asQuantity(m));
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});

ann.register('@annotator:hypothesis:median', {
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

    const m0 = stats.median(x0);
    const m1 = stats.median(x1);

    const relChange = (m0 - m1) / m1;
    result.set(HypothesisAnnotations.relativeDifference, relChange);

    let boot: stats.bootstrap.StudentizedDifferenceResult | undefined;
    let rejectH0 = false;

    if (
      request.has(HypothesisAnnotations.differenceCI.id) ||
      request.has(HypothesisAnnotations.power)
    ) {
      const opts = {
        ...HypothesisAnnotations.differenceCI.opts,
        ...request.get(HypothesisAnnotations.differenceCI.id),
      };

      array.sort(x0);
      array.sort(x1);

      // The main difference test
      boot = stats.bootstrap.studentizedDifferenceTest(
        x0,
        x1,
        (x0, x1) => stats.median(x0, true) - stats.median(x1, true),
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
      result.set(HypothesisAnnotations.power, boot.power);
    }

    // summary of the difference
    if (request.has(HypothesisAnnotations.differenceSummary)) {
      const fmt = new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 });
      let summary = (relChange > 0 ? '+' : '') + fmt.format(relChange * 100) + '%';

      if (boot) {
        const lo = boot.interval[0] / m1;
        const hi = boot.interval[1] / m1;

        summary += ` (${fmt.format(lo * 100)}, ${fmt.format(hi * 100)})`;
      }

      result.set(HypothesisAnnotations.differenceSummary, summary);
    }

    // report statistical significance
    if (request.has(HypothesisAnnotations.significantDifference.id)) {
      result.set(HypothesisAnnotations.significantDifference.id, rejectH0 ? relChange : 0);
    }

    // report meaningful difference according to the sample MDES
    if (request.has(HypothesisAnnotations.meaningfulDifference.id)) {
      const opts = {
        ...HypothesisAnnotations.meaningfulDifference.opts,
        ...request.get(HypothesisAnnotations.meaningfulDifference.id),
      };

      if (rejectH0) {
        if (opts.minimumEffectSize === 'auto') {
          const mde0 = c0.mdes();
          const mde1 = c0.mdes();
          const mde = Math.max(mde0, mde1);

          result.set(HypothesisAnnotations.meaningfulDifference.id, relChange >= mde);
        } else if (typeof opts.minimumEffectSize === 'number') {
          result.set(
            HypothesisAnnotations.meaningfulDifference.id,
            relChange >= opts.minimumEffectSize,
          );
        }
      }
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});
