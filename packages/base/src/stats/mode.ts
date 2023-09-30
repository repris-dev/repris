import { sort } from '../array.js';
import { assert, Indexable, random, stats } from '../index.js';
import { online } from '../stats.js';
import * as boot from './bootstrap.js';
import { mean } from './centralTendency.js';
import { quantile, qcd, median } from './util.js';

/** A Robust Estimation of the Mode */
export type REM = {
  /** The bounds of the sub-sample (indices in to a sample) */
  bound: [lower: number, upper: number];

  /**
   * The estimation of the mode as the average
   * of either end of the bound
   */
  mode: number;

  /**
   * Number of ties encountered. The left-most bound in the sample
   * is returned when encountering a tie
   */
  ties: number;

  /** A coefficient of variation */
  variation: number;
};

/**
 * Find the shortest interval in the given sample containing the
 * specified number of observations (k)
 */
export function modalSearch(sample: Indexable<number>, k: number, i = 0, len = sample.length) {
  assert.le(k, len);
  assert.gte(len, 2);
  assert.bounds(sample, i);
  assert.bounds(sample, i + len - 1);

  const EPS = 1e-8,
    end = i + len;

  let minRange = Infinity,
    lo = i,
    hi = end,
    ties = 0;

  for (; i + k <= end; i++) {
    const j = i + k - 1;
    const range = sample[j] - sample[i];

    if (range < minRange) {
      minRange = range;
      lo = i;
      hi = j;
      ties = 0;
    } else if (range - minRange < EPS) {
      ties++;
    }
  }

  return {
    range: [lo, hi] as [number, number],
    ties,
  };
}

function oneSampleRME(sample: Indexable<number>): REM {
  assert.eq(sample.length, 1);

  return {
    mode: sample[0],
    bound: [0, 0],
    ties: 0,
    variation: 0,
  };
}

/**
 * Half-sample mode (HSM)
 *
 * The variation returned is the Quartile coefficient of dispersion
 * of the shorth.
 *
 * See:
 * On a fast, robust estimator of The mode - David R. Bickel
 * https://arxiv.org/ftp/math/papers/0505/0505419.pdf
 */
export function hsm(sample: Indexable<number>, minInterval?: number): REM {
  assert.gt(sample.length, 0);

  if (sample.length === 1) return oneSampleRME(sample);

  sort(sample);
  return hsmImpl(sample, minInterval);
}

/**
 * A robust estimation of the standard deviation of a sample
 * at the mode.
 * 
 * @param std Controls the proportion of the sample about the mode to
 * take in to account
 */
export function estimateStdDev(xs: Indexable<number>, std = 1) {
  // The proportion of the sample (window size) to find which would correspond
  // to std (standard deviations). e.g. 1 s.d. = .682
  const m = 1 - (1 - stats.normal.cdf(std)) * 2;

  // width containing the proportion of the data
  const bound = stats.mode.lms(xs, m).bound;
  const a = xs[bound[1]] - xs[bound[0]];

  // convert to standard dev.
  return (a * (1 / std)) / 2;
}

/**
 * @param sample
 * @param level The confidence level, between (0, 1)
 * @param K The number of bootstrap samples
 * @returns The bootstrapped confidence interval of the Half-sample mode (HSM)
 */
export function hsmConfidence(
  sample: Indexable<number>,
  level: number,
  K: number,
  smoothing?: number
): [lo: number, hi: number] {
  assert.inRange(level, 0, 1);
  assert.gt(K, 1);

  // bootstrap distribution of HSMs
  const hsms = new Float64Array(K);

  sort(sample);
  for (let i = 0, next = boot.resampler(sample, void 0, smoothing); i < K; i++) {
    hsms[i] = hsmImpl(next()).mode;
  }

  return [
    quantile(hsms, 0.5 - level / 2),
    quantile(hsms, 0.5 + level / 2),
  ];
}

/**
 * @param sample
 * @param level The confidence level, between (0, 1)
 * @param K The number of bootstrap samples
 * @returns The bootstrapped confidence interval of the Half-sample mode (HSM)
 */
export function medianConfidence(
  sample: Indexable<number>,
  level: number,
  K: number,
  smoothing?: number
): [lo: number, hi: number] {
  assert.inRange(level, 0, 1);
  assert.gt(K, 1);

  // bootstrap distribution of HSMs
  const hsms = new Float64Array(K);

  sort(sample);
  for (let i = 0, next = boot.resampler(sample, void 0, smoothing); i < K; i++) {
    hsms[i] = quantile(next(), 0.5);
  }

  return [
    quantile(hsms, 0.5 - level / 2),
    quantile(hsms, 0.5 + level / 2),
  ];
}

/**
 * A percentile bootstrapped paired HSM difference test of two samples.
 * x0 - x1
 */
export function hsmDifferenceTest(
  x0: Indexable<number>,
  x1: Indexable<number>,
  level: number,
  K: number,
  entropy = random.mathRand,
  smoothing: number | [smoothing0: number, smoothing1: number] = 0,
): [lo: number, hi: number] {
  assert.inRange(level, 0, 1);
  assert.gt(K, 1);

  // bootstrap distribution of HSM differences
  const hsms = new Float64Array(K);
  const [smoothing0, smoothing1] = typeof smoothing === 'number'
    ? [smoothing, smoothing]
    : smoothing;

  sort(x0);
  for (let i = 0, next0 = boot.resampler(x0, entropy, smoothing0); i < K; i++) {
    hsms[i] = hsmImpl(next0()).mode;
  }

  sort(x1);
  for (let i = 0, next1 = boot.resampler(x1, entropy, smoothing1); i < K; i++) {
    hsms[i] -= hsmImpl(next1()).mode;
  }

  //console.info(hsms.reduce((acc, x) => acc + x + ', ', ''));
  // {
  //   const os = online.Gaussian.fromValues(hsms);
  //   console.info('jarqueBera', os.skewness(1), os.kurtosis(1), stats.jarqueBera(os.N(), os.skewness(1), os.kurtosis(1), 1))
  // }

  return [
    quantile(hsms, 0.5 - level / 2),
    quantile(hsms, 0.5 + level / 2),
  ];
}

/**
 * A studentized bootstrapped paired HSM difference test of two samples. x0 - x1
 * @reference https://olebo.github.io/textbook/ch/18/hyp_studentized.html
 * @reference http://bebi103.caltech.edu.s3-website-us-east-1.amazonaws.com/2019a/content/recitations/bootstrapping.html
 */
export function studentizedHsmDifferenceTest(
  x0: Indexable<number>,
  x1: Indexable<number>,
  level: number,
  /** number of primary resamples */
  K: number,
  /** number of secondary resamples */
  KK: number,
  entropy = random.mathRand
): [lo: number, hi: number] {
  const estimator = (x0: Indexable<number>, x1: Indexable<number>) => median(x0) - median(x1);
  const resampler = boot.pairedStudentizedResampler(
    x0, x1, estimator, KK, entropy
  );

  const stat = estimator(x0, x1);
  const pivotalQuantities = new Float64Array(K);
  const estStat = new online.Gaussian();

  for (let i = 0; i < K; i++) {
    const ti = resampler();
    pivotalQuantities[i] = ti.pivotalQuantity;
    estStat.push(ti.estimate);
  }

  const bootStd = estStat.std();
  console.info('K', K, KK, level);
  console.info('jarqueBera', stats.jarqueBera(estStat.N(), estStat.skewness(1), estStat.kurtosis(1), 1))

  return [
    stat - bootStd * quantile(pivotalQuantities, 0.5 + level / 2),
    stat - bootStd * quantile(pivotalQuantities, 0.5 - level / 2)
  ];
}

/** Note: Assumes the given sample is sorted */
function hsmImpl(sample: Indexable<number>, minInterval = 2): REM {
  assert.gte(minInterval, 2);

  let lo = 0, hi = sample.length - 1;
  let variation1 = 0;

  while (hi - lo + 1 > minInterval) {
    // Recursively find the shortest interval that contains n samples
    // within the bounds of the previous window
    const space = hi - lo + 1;
    const n = Math.max(minInterval, Math.ceil(space / 2));

    [lo, hi] = modalSearch(sample, n, lo, space).range;

    if (variation1 <= 0) {
      variation1 = qcd([sample[lo], sample[hi]]);
    }
  }

  // The mode is the mean of the two consecutive values
  assert.eq(hi - lo + 1, minInterval);

  const lo0 = sample[lo],
    hi0 = sample[hi],
    mode = lo0 + (hi0 - lo0) / 2;

  return {
    bound: [lo, hi],
    ties: 0,
    variation: variation1,
    mode,
  };
}

/**
 * Least Median of Squares.
 *
 * A robust estimate of the mode returning the median of the shortest
 * interval containing a specified fraction of the sample.
 *
 * The variation is the Quartile coefficient of dispersion of the mode
 *
 * See:
 * On a fast, robust estimator of The mode - David R. Bickel
 * https://arxiv.org/ftp/math/papers/0505/0505419.pdf
 *
 * TODO: correct implementation for small samples (N=1-3)
 */
export function lms(sample: Indexable<number>, alpha = 0.5): REM {
  assert.gt(sample.length, 0);
  assert.gt(alpha, 0);
  assert.le(alpha, 1);

  const n = sample.length;
  if (n === 1) return oneSampleRME(sample);

  sort(sample);

  const windowSize = Math.ceil(n * alpha),
    r = modalSearch(sample, windowSize);

  const [lodx, hidx] = r.range;
  assert.eq(hidx - lodx + 1, windowSize);

  const midpoint = windowSize / 2;
  const mode =
    windowSize % 2 === 0
      ? (sample[midpoint - 1] + sample[midpoint]) / 2
      : sample[Math.floor(midpoint)];

  return {
    bound: r.range,
    ties: r.ties,
    variation: qcd([sample[lodx], sample[hidx]]),
    mode,
  };
}

/**
 * Shorth
 *
 * A robust estimate of the mode, returning the arithmetic mean of the shortest
 * interval containing a specified fraction of the sample.
 *
 * The variation is the standard deviation of the interval divided by the mode
 *
 * @param sample values
 * @param alpha The fraction of the sample in the interval. 0.5
 * (i.e. half the sample) produces the 'shorth'.
 */
export function shorth(
  sample: Indexable<number>,
  alpha = 0.5,
  dist: stats.online.OnlineStat<number> = new stats.online.Lognormal()
): REM {
  assert.gt(sample.length, 0);
  assert.gt(alpha, 0);
  assert.le(alpha, 1);

  const n = sample.length;
  if (n === 1) return oneSampleRME(sample);

  sort(sample);

  const windowSize = Math.ceil(n * alpha),
    r = modalSearch(sample, windowSize);

  const [lodx, hidx] = r.range;

  dist.reset();

  // The mode is the mean of the interval
  for (let i = lodx; i <= hidx; i++) {
    dist.push(sample[i]);
  }

  return {
    bound: r.range,
    variation: dist.std(1) / dist.mode(),
    ties: r.ties,
    mode: dist.mode(),
  };
}
