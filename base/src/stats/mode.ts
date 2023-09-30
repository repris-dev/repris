import { sort } from '../array.js';
import { assert, Indexable, stats } from '../index.js';

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
}

/**
 * Find the shortest interval in the given sample containing the
 * specified number of observations (k)
 */
function modalSearch(sample: Indexable<number>, k: number, i = 0, len = sample.length) {
  assert.le(k, len);
  assert.bounds(sample, i);
  assert.bounds(sample, i + len - 1);

  let minRange = Infinity,
      lo = -1,
      hi = -1,
      ties = 0;

  const end = i + len;

  for (; i + k < end; i++) {
    const range = sample[i + k] - sample[i];

    if (range < minRange) {
      minRange = range;
      lo = i;
      hi = i + k;
      ties = 0;
    } else if (range - minRange < 1e-6) {
      ties++;
    }
  }

  return {
    range: [lo, hi] as [number, number],
    ties
  };
}

function oneSampleRME(sample: Indexable<number>): REM {
  assert.eq(sample.length, 1);

  return {
    mode: sample[0],
    bound: [0, 0],
    ties: 0,
    variation: 0
  };
}

/**
 * Half-sample mode (HSM)
 *
 * See:
 * On a fast, robust estimator of The mode - David R. Bickel
 * https://arxiv.org/ftp/math/papers/0505/0505419.pdf
 */
export function hsm(sample: Indexable<number>): REM {
  const n = sample.length;
  if (n === 1) { return oneSampleRME(sample); }

  sort(sample);

  let windowSize = n,
      bound = [0, n - 1] as [number, number],
      qcd = 1,
      mode = 0,
      depth = 0;

  while (windowSize >= 2) {
    windowSize = Math.ceil(windowSize * .5);

    const w = sample[bound[1]] - sample[bound[0]];

    bound = modalSearch(
      sample, windowSize, bound[0], (bound[1] - bound[0]) + 1
    ).range;

    const lo = sample[bound[0]],
          hi = sample[bound[1]];

    depth++;
    qcd += (hi - lo) * (1 / depth);
    mode = (lo * .5) + (hi * .5);
  }

  assert.eq(bound[1], bound[0] + 1);
  assert.gt(depth, 0);

  return {
    bound,
    ties: 0,
    variation: 0, //qcd / mode,
    mode
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
export function lms(sample: Indexable<number>, alpha = .5): REM {
  assert.gt(alpha, 0);
  assert.le(alpha, 1);

  const n = sample.length;
  if (n === 1) { return oneSampleRME(sample); }

  sort(sample);

  const windowSize = Math.ceil(n * alpha),
        r = modalSearch(sample, windowSize);

  const [lodx, hidx] = r.range;
  assert.eq(hidx - lodx, windowSize);

  const midpoint = windowSize / 2;
  const mode = windowSize % 2 === 0
        ? (sample[midpoint - 1] + sample[midpoint]) / 2
        : sample[Math.floor(midpoint)];

  const variation = (sample[hidx] - sample[lodx]) / mode;

  return {
    bound: [sample[lodx], sample[hidx]],
    ties: r.ties,
    variation,
    mode
  };
}

/**
 * Shorth
 *
 * A robust estimate of the mode, returning the arithmetic mean of the shortest
 * interval containing a specified fraction of the sample.
 *
 * The variation is the relative range of the interval (the range divided by
 * the mode)
 *
 * @param sample values
 * @param alpha The fraction of the sample in the interval. 0.5
 * (i.e. half the sample) produces the 'shorth'.
 */
export function shorth(sample: Indexable<number>, alpha = .5): REM {
  assert.gt(alpha, 0);
  assert.le(alpha, 1);

  const n = sample.length;
  if (n === 1) { return oneSampleRME(sample); }

  sort(sample);

  const windowSize = Math.ceil(n * alpha),
        r = modalSearch(sample, windowSize);

  const [lodx, hidx] = r.range;
  const lo = sample[lodx], hi = sample[hidx];
  const os = new stats.OnlineStats();

  // The mode is the mean of the interval
  for (let i = lodx; i <= hidx; i++) {
   os.push(sample[i]);
  }

  return {
    bound: [lo, hi],
    variation: os.cov(),
    ties: r.ties,
    mode: os.mean(),
  };
}
