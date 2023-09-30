import { stats, Indexable, array, assert, random, lazy } from '@repris/base';

import { AnalysisOptions, ConflatedSampleStatus } from './types.js';

export interface KWOptions extends AnalysisOptions {
  /**
   * Method to remove samples from a cache when more than the maximum
   * number are supplied.
   */
  exclusionMethod: 'slowest' | 'outliers';

  inputOrder?: 'oldestFirst';
}

export type KWConflationResult<T> = {
  /** Status/classification of each sample */
  stat: { sample: T; status: ConflatedSampleStatus }[];

  /** Effect size of the consistent subset */
  effectSize: number;
};

/**
 * Creates a conflation of samples based on Kruskal-Wallis one-way
 * analysis of variance and Dunn's post-hoc test
 */
export class KWConflation<T> {
  readonly kw: stats.KruskalWallisResult<Indexable<number>> | undefined;
  readonly raw: Indexable<number>[];

  constructor(private taggedSamples: [sample: Indexable<number>, tag: T][]) {
    const N = taggedSamples.length;

    this.raw = taggedSamples.map(x => x[0]);
    this.kw = N >= 2 ? stats.kruskalWallis(this.raw) : void 0;
  }

  conflate(opts: KWOptions): KWConflationResult<T> {
    let { taggedSamples: samples, raw: rawSamples, kw } = this;

    const N = samples.length;

    if (N < 2) {
      const stat =
        N === 1 ? [{ sample: samples[0][1], status: 'consistent' as ConflatedSampleStatus }] : [];

      return {
        stat,
        effectSize: 0,
      };
    }

    assert.isDefined(kw);

    // Sampling distribution, sorted by hsm;
    const samplingDist = this.taggedSamples.map(([raw, tag]) => ({
      raw,
      sample: tag,
      mode: stats.mode.hsm(raw).mode,
      status: 'outlier' as ConflatedSampleStatus
    }));

    // Sorting of the sampling distribution, distance from mean (desc)
    let subset = samplingDist.slice();

    if (N > opts.maxSize) {
      // reject the outlier samples
      const rejector = outlierSelection(subset, s => s.mode);

      for (let n = N; n > opts.maxSize; n--) {
        const s = rejector();
        assert.isDefined(s);
        s.status = 'rejected';
      }

      // from the remaining samples, compute KW again.
      subset = subset.filter(s => s.status !== 'rejected');
      assert.eq(subset.length, opts.maxSize);
    }

console.info('samplingDist', subset.map(x => x.mode));

    // median of the sampling distribution
    const sDistMean = stats.centralTendency.mean(samplingDist.map(x => x.mode));

console.info('sDistMean', sDistMean);

    // Confidence of the sampling dist
    const c99 = stats.mode.medianConfidence(samplingDist.map(x => x.mode), 0.99, 1000);
    const m99 = (c99[1] - c99[0]) / sDistMean;

console.info('m99', m99);

{
  const xsTmp = samplingDist.map(w => w.mode);
  const med = stats.median(xsTmp), std = stats.mad(xsTmp, med).normMad;

  console.info('w99', std / med, stats.allPairs.crouxQn(xsTmp).correctedSpread / med)
}

    if (subset.length >= opts.minSize) {
      // resort by mode (ascending)

console.info('------------')   ;

      // mark consistent samples
//      if (kw.effectSize <= opts.maxEffectSize) {
      if (m99 < opts.maxEffectSize) {
        subset.forEach(x => x.status = 'consistent');
      }
    }

    return {
      stat: samplingDist,
      effectSize: m99
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
      sigmas[i] = Math.abs(xs[i] - med) / std;
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
