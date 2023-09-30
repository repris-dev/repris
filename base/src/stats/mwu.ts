import { fillAscending } from '../array.js';
import { Indexable } from '../util.js';

export function mwu(as: Indexable<number>, bs: Indexable<number>) {
  const N = as.length + bs.length;
  // first index of sample b
  const midIdx = as.length;
  const get = (i: number) => (i >= midIdx ? bs[i - midIdx] : as[i]);

  // sorted indices
  const idxs = new Int32Array(N);
  fillAscending(idxs, 0);

  idxs.sort((adx, bdx) => get(adx) - get(bdx));

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

  let u1 = aLen * bLen + (aLen * (aLen + 1)) / 2 - r1;
  let u2 = aLen * bLen + (bLen * (bLen + 1)) / 2 - r2;

  return {
    u1,
    u2,
    /**
     * Common language effect size:
     * The probability that a randomly selected score from population 'a'
     * will be ranked lower than a randomly sampled score from population 'b'.
     */
    effectSize: u1 / (aLen * bLen),
  };
}
