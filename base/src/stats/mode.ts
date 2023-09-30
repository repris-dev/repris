import { sort } from '../array.js';
import { assert, Indexable, stats } from '../index.js';
import { resampler } from './bootstrap.js';
import { percentile, qcd } from './util.js';

/** Robust Estimation of the Mode */
export type REM = {
  /** The bounds of the sub-sample */
  bound: [lower: number, upper: number];

  /**
   * The estimation of the mode as the average
   * of either end of the bound
   */
  mode: number;

  /**
   * Number of ties encountered. The left-most bound is
   * returned when encountering a tie
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

  for (; i + k < end; i++) {
    const range = sample[i + k] - sample[i];

    if (range < minRange) {
      minRange = range;
      lo = i;
      hi = i + k;
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
export function hsm(sample: Indexable<number>): REM {
  assert.gt(sample.length, 0);

  const n = sample.length;
  if (n === 1) return oneSampleRME(sample);

  sort(sample);
  return hsmImpl(sample);
}

/**
 * @param sample
 * @param level The confidence level, between (0, 1)
 * @param K The number of bootstrap samples
 * @returns The bootstrapped confidence interval of the Half-sample mode (HSM)
 */
export function hsmConfidence(
  sample: Indexable<number>,
  level = 0.95,
  K = 100
): [lo: number, hi: number] {
  assert.inRange(level, 0, 1);
  assert.gt(K, 1);

  // bootstrap distribution of HSMs
  const hsms = new Float64Array(K);

  sort(sample);
  for (let i = 0, next = resampler(sample); i < K; i++) {
    hsms[i] = hsmImpl(next()).mode;
  }

  return [percentile(hsms, 0.5 - level / 2), percentile(hsms, 0.5 + level / 2)];
}

/**
 * A bootstrapped paired HSM difference test of two samples.
 * x0 - x1
 */
export function hsmDifferenceTest(
  x0: Indexable<number>,
  x1: Indexable<number>,
  level = 0.95,
  K = 100
): [lo: number, hi: number] {
  assert.inRange(level, 0, 1);
  assert.gt(K, 1);

  // bootstrap distribution of HSM differences
  const hsms = new Float64Array(K);

  sort(x0);
  for (let i = 0, next0 = resampler(x0); i < K; i++) {
    hsms[i] = hsmImpl(next0()).mode;
  }

  sort(x1);
  for (let i = 0, next1 = resampler(x1); i < K; i++) {
    hsms[i] -= hsmImpl(next1()).mode;
  }

  return [percentile(hsms, 0.5 - level / 2), percentile(hsms, 0.5 + level / 2)];
}

/** Note: Assumes the given sample is sorted */
function hsmImpl(sample: Indexable<number>): REM {
  const n = sample.length;

  let windowSize = n / 2,
    [b0, b1] = modalSearch(sample, Math.ceil(windowSize)).range,
    variation = qcd([sample[b0], sample[b1]]);

  // Recursively find the shortest interval that contains 50% of the window
  while (b1 - b0 >= 2) {
    windowSize /= 2;
    [b0, b1] = modalSearch(sample, Math.ceil(windowSize), b0, b1 - b0 + 1).range;
  }

  // The mode is the mean of the two consecutive values
  assert.eq(b1, b0 + 1);

  const lo0 = sample[b0],
    hi0 = sample[b1],
    mode = lo0 + (hi0 - lo0) / 2;

  return {
    bound: [b0, b1],
    ties: 0,
    variation,
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
  assert.eq(hidx - lodx, windowSize);

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
