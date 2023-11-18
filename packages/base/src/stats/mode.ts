import { sort, ArrayView } from '../array.js';
import { assert, stats } from '../index.js';
import { qcd } from './util.js';

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
export function modalSearch(sample: ArrayView<number>, k: number, i = 0, len = sample.length) {
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
      if (j === hi + 1) hi++;
      ties++;
    }
  }

  if (ties > 0) {
    // When the final range is larger than k, pick the middle k
    // values of the range
    lo = lo + Math.floor(ties / 2);
    hi = lo + k - 1;
  }

  return {
    range: [lo, hi] as [number, number],
    ties,
  };
}

function oneSampleRME(sample: ArrayView<number>): REM {
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
export function hsm(sample: ArrayView<number>, minInterval?: number): REM {
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
export function estimateStdDev(xs: ArrayView<number>, std = 1) {
  // The proportion of the sample (window size) to find which would correspond
  // to std (standard deviations). e.g. 1 s.d. = .682
  const m = 1 - (1 - stats.normal.cdf(std)) * 2;

  // width containing the proportion of the data
  const bound = stats.mode.lms(xs, m).bound;
  const a = xs[bound[1]] - xs[bound[0]];

  // convert to standard dev.
  return (a * (1 / std)) / 2;
}

/** Note: Assumes the given sample is sorted */
function hsmImpl(sample: ArrayView<number>, minInterval = 2): REM {
  assert.gte(minInterval, 2);

  let lo = 0,
    hi = sample.length - 1;
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
 * A robust estimate of the mode returning the midpoint of the shortest
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
export function lms(sample: ArrayView<number>, alpha = 0.5): REM {
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
  sample: ArrayView<number>,
  alpha = 0.5,
  dist: stats.online.OnlineStat<number> = new stats.online.Gaussian(),
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
