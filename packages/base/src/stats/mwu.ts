import { iota, ArrayView } from '../array.js';
import * as assert from '../assert.js';
import * as chiSq from './chiSq.js';
import { sidak, stbPhi } from './util.js';

export type MWUResult = {
  u1: number;
  u2: number;
  /**
   * Common language effect size:
   * The probability that a randomly selected score from population 'a'
   * will be ranked lower than a randomly sampled score from population 'b'.
   */
  effectSize: number;
};

/**
 * Mann–Whitney U test
 */
export function mwu(as: ArrayView<number>, bs: ArrayView<number>): MWUResult {
  const N = as.length + bs.length;
  // first index of sample b
  const midIdx = as.length;
  const get = (i: number) => (i >= midIdx ? bs[i - midIdx] : as[i]);

  // sorted indices
  const idxs = iota(new Int32Array(N), 0).sort((adx, bdx) => get(adx) - get(bdx));

  // sum the ranks of sample-a
  let r1 = 0;
  let r2 = 0;

  for (let i = 0; i < N; ) {
    const idx = idxs[i];
    const x = get(idx);

    let j = i;
    while (j + 1 < N && get(idxs[j + 1]) === x) {
      j++;
    }

    const rank = 1 + (j + i) / 2;

    while (i <= j) {
      if (idxs[i] < midIdx) {
        r1 += rank;
      } else {
        r2 += rank;
      }
      i++;
    }
  }

  const aLen = as.length;
  const bLen = bs.length;

  const u1 = aLen * bLen + (aLen * (aLen + 1)) / 2 - r1;
  const u2 = aLen * bLen + (bLen * (bLen + 1)) / 2 - r2;

  return {
    u1,
    u2,
    effectSize: u1 / (aLen * bLen),
  };
}

export type KruskalWallisResult<T> = {
  /** Number of samples supplied */
  size: number;

  /** Statistic */
  H: number;

  /**
   * The estimated epsilon squared effect size for Kruskal-Wallis test
   * based on the H-statistic
   *
   * Maciej Tomczak and Ewa Tomczak. The need to report effect size
   * estimates revisited. An overview of some recommended measures of effect size.
   * Trends in Sport Sciences. 2014; 1(21):19-25.
   */
  effectSize: number;

  /** Average rank of each sample */
  ranks: ArrayView<number>;

  pValue(): number;

  /**
   * Performs the post-hoc Dunn's test on the given pair of sample indices.
   * @returns p-value, or Šidák-adjusted p-value
   */
  dunnsTest(i: number, j: number, adjust?: boolean): { p: number; effectSize: number };
};

/**
 * Kruskal–Wallis one-way analysis of variance and post-hoc Dunn's test
 * Reference: Voshol, G.P. (2022). STB: A simple Statistics Tool Box (Version 1.23).
 */
export function kruskalWallis<T extends ArrayView<number>>(samples: T[]): KruskalWallisResult<T> {
  assert.gt(samples.length, 1, 'There must be at least two samples');

  const G = samples.length;
  const N = samples.reduce((n, curr) => n + curr.length, 0);

  // concatenated samples
  const sample = new Float64Array(N);
  // original sample of each observation in the concatenated sample
  const origin = new Int16Array(N);
  // sorted indices of each observation
  const idxs = new Int32Array(N);

  // initialize
  for (let g = 0, off = 0; g < G; g++) {
    const xs = samples[g];

    for (let i = 0; i < xs.length; i++) {
      sample[off] = xs[i];
      origin[off] = g;
      off++;
    }
  }

  assert.eq(N, sample.length);

  iota(idxs, 0).sort((adx, bdx) => sample[adx] - sample[bdx]);

  // rank initialization
  const ranks = iota(new Float64Array(N), 1);

  // resolve tied ranks and tally total ties for later correction
  let ties = 0;

  for (let i = 0; i < N; ) {
    const idx = idxs[i];
    const x = sample[idx];

    let j = i;

    while (j + 1 < N && sample[idxs[j + 1]] === x) {
      j++;
    }

    if (j > i) {
      // A correction for ties if using the short-cut formula
      const tieSize = 1 + (j - i);
      ties += tieSize ** 3 - tieSize;

      const rank = 1 + (j + i) / 2;
      while (i <= j) {
        ranks[i++] = rank;
      }
    }

    i = j + 1;
  }

  // rank sums of each group
  const rankSums = new Float64Array(G);

  for (let i = 0; i < N; i++) {
    const idx = idxs[i];
    rankSums[origin[idx]] += ranks[i];
  }

  let H = 0;

  for (let g = 0; g < G; g++) {
    // size of the group
    const Ng = samples[g].length;
    if (Ng > 0) {
      H += rankSums[g] ** 2 / Ng;
    }
  }

  H *= 12 / (N * (N + 1));
  H -= 3 * (N + 1);

  {
    const correction = 1 - ties / (N ** 3 - N);
    // correction is zero when all samples are identical
    if (correction !== 0) {
      H /= correction;
    }
  }

  function dunnsTest(i: number, j: number, adjust?: boolean) {
    assert.inRange(i, 0, G - 1);
    assert.inRange(j, 0, G - 1);

    const Ni = samples[i].length;
    const Nj = samples[j].length;

    if (Ni === 0 || Nj === 0) {
      return { p: 0.0, effectSize: 0 };
    }

    const sigma = Math.sqrt(((N * (N + 1) - ties / (N - 1)) / 12) * (1 / Ni + 1 / Nj));
    const z = Math.abs((rankSums[i] / Ni - rankSums[j] / Nj) / sigma);
    const p = 2 * (1 - stbPhi(z));

    return {
      p: adjust ? sidak(p, (G * (G - 1)) / 2) : p,
      effectSize: z / Math.sqrt(Ni + Nj),
    };
  }

  function pValue() {
    return 1 - chiSq.cdf(H, G - 1);
  }

  return {
    size: G,
    H,
    effectSize: H / ((N * N - 1) / (N + 1)),
    ranks: rankSums.map((sum, i) => sum / samples[i].length),
    pValue,
    dunnsTest,
  };
}
