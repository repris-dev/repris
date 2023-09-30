import { stats, Indexable, array, assert, random, lazy } from '@repris/base';

import { AnalysisOptions, ConflatedSampleStatus } from './types.js';

export type KWConflationResult<T> = {
  /** Status/classification of each sample */
  stat: { sample: T; status: ConflatedSampleStatus }[];

  /** Sampling distribution of the consistent subset, if any */
  samplingDistribution: number[];

  /** Relative scale of the consistent subset */
  relativeSpread: number;
};

/**
 * Creates a conflation of samples based on Kruskal-Wallis one-way
 * analysis of variance and Dunn's post-hoc test
 */
export class KWConflation<T> {
  constructor(private taggedPointEstimates: [pointEstimate: number, tag: T][]) {}

  conflate(opts: AnalysisOptions): KWConflationResult<T> {
    let { taggedPointEstimates: taggedDist } = this;

    const N = taggedDist.length;

    if (N < 2) {
      const stat = N === 1
        ? [{ sample: taggedDist[0][1], status: 'consistent' as ConflatedSampleStatus }]
        : [];

      return {
        stat,
        relativeSpread: 0,
        samplingDistribution: [taggedDist[0][0]]
      };
    }

    // Sampling distribution, sorted by hsm;
    let stat = this.taggedPointEstimates.map(([pointEst, tag]) => ({
      sample: tag,
      statistic: pointEst,
      status: 'outlier' as ConflatedSampleStatus
    }));

    // Sorting of the sampling distribution, distance from mean (desc)
    let subset = stat.slice();

    if (N > opts.maxSize) {
      // reject the outlier samples
      const rejector = outlierSelection(subset, s => s.statistic);

      for (let n = N; n > opts.maxSize; n--) {
        const s = rejector();
        assert.isDefined(s);
        s.status = 'rejected';
      }

      // from the remaining samples, compute KW again.
      subset = subset.filter(s => s.status !== 'rejected');
      assert.eq(subset.length, opts.maxSize);
    }

    const samplingDistribution = subset.map(x => x.statistic);
    let relativeSpread = 0;

    {
      const xsTmp = subset.map(w => w.statistic);
      const os = stats.online.Gaussian.fromValues(xsTmp);

      relativeSpread = os.cov(1);

      // Sort by distance from the mean as the measure of centrality
      stat = stat.sort((a, b) => Math.abs(a.statistic - os.mean()) - Math.abs(b.statistic - os.mean()))
    }

    if (subset.length >= opts.minSize) {
      // mark consistent samples
      if (relativeSpread <= opts.maxUncertainty) {
        subset.forEach(x => (x.status = 'consistent'));
      }
    }

    return {
      stat,
      relativeSpread,
      samplingDistribution,
    };
  }
}

export function outlierSelection<T>(
  keys: Indexable<T>,
  toScalar: (k: T) => number,
  entropy = random.PRNGi32()
): () => T | undefined {
  const N = keys.length, xs = new Float64Array(N);
  for (let i = 0; i < N; i++) xs[i] = toScalar(keys[i]);

  const xsTmp = xs.slice();
  const sigmas = new Float64Array(N),
    med = stats.median(xsTmp),
    std = stats.mad(xsTmp, med).normMad;

  if (std > 0) {
    // weight by distance from the median, normalized by
    // estimate of standard deviation 
    for (let i = 0; i < N; i++) {
      sigmas[i] = (Math.abs(xs[i] - med) / std) ** 2;
    }
  }

  // A lazy list of index-pointers constructing a tour of all items,
  // ordered by centrality
  const tour: () => Indexable<number> = lazy(() => {
    // sorting of keys by weight descending
    const order = array
      .fillAscending(new Int32Array(N), 0)
      .sort((a, b) => sigmas[b] - sigmas[a]);

    const tour = new Int32Array(N);
    let prev = order[0];

    for (let i = 1; i < N; i++) {
      const ith = order[i];
      tour[prev] = ith;
      prev = ith;
    }

    tour[prev] = order[0];
    return tour;
  });

  const dist = random.discreteDistribution(sigmas, entropy);
  const seen = new Int32Array(N);

  let totSeen = 0;

  return () => {
    // filtered everything?
    if (totSeen >= N) return void 0;

    let idx = dist();

    // ensure we're not returning duplicates
    while (seen[idx] > 0) {
      idx = tour()[idx];
    }

    totSeen++;
    seen[idx]++;

    return keys[idx];
  };
}
