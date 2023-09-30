import { stats, Indexable, array, iterator, assert } from '@repris/base';

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

    // sort all samples by pairwise-similarity or by average ranking
//    const sortedIndices = opts.exclusionMethod === 'outliers' ? dunnAvgSort(kw) : kwRankSort(kw);
// const sortedIndices = kwRankSort(kw);

    // Sampling distribution, sorted by hsm;
    const samplingDist = this.taggedSamples
      .map(([raw, tag]) => ({ raw, sample: tag, mode: stats.mode.hsm(raw).mode, status: 'outlier' as ConflatedSampleStatus }))
      .sort((a, b) => a.mode - b.mode);

    // HSM of the sampling distribution
//    const sDistHsm = stats.mode.hsm(samplingDist.map(x => x.mode)).mode;
    const sDistMedian = stats.median(samplingDist.map(x => x.mode));

console.info('>> kw0', kw.effectSize, kw.pValue());

//console.info('sDistHSM', sDistHsm);
console.info('sDistMedian', sDistMedian);

    // Confidence of the sampling dist
    const c99 = stats.mode.medianConfidence(samplingDist.map(x => x.mode), 0.99, 1000);
    const m99 = (c99[1] - c99[0]) / sDistMedian;
//
console.info('m99', m99);

    // Sorting of the sampling distribution, distance from HSM (ascending)
    let subset = samplingDist.slice()
      .sort((a, b) => Math.abs(sDistMedian - a.mode) - Math.abs(sDistMedian - b.mode));

    // Index of samples
    const statIndex = new Map(iterator.map(subset, x => [x.raw, x]));

    if (N > opts.maxSize) {
      // reject the outlier samples
      for (const { raw } of subset.slice(opts.maxSize)) {
        statIndex.get(raw)!.status = 'rejected';
      }

      // from the remaining samples, compute KW again.
      subset = subset.slice(0, opts.maxSize);
      //kw = stats.kruskalWallis(subset);
    }

    if (subset.length >= opts.minSize) {
      // resort by mode (ascending)
      subset.sort((a, b) => a.mode - b.mode);
  
console.info('samplingDist', subset.map(x => x.mode));

      const bound = stats.mode.hsm(subset.map(x => x.mode), opts.minSize).bound;

console.info('bound', bound);      
      
      subset = subset.slice(bound[0], bound[1] + 1);

      assert.eq(subset.length, opts.minSize);

      kw = stats.kruskalWallis(subset.map(s => s.raw));

console.info('>> kw1', kw.effectSize, kw.pValue());
console.info('------------')   ;

      // mark consistent samples
//      if (kw.effectSize <= opts.maxEffectSize) {
      if (m99 < 0.01) {
        subset.forEach(x => (statIndex.get(x.raw)!.status = 'consistent'));
      }
    }

    return {
      stat: iterator.collect(statIndex.values()),
      effectSize: kw.effectSize,
    };
  }
}

/**
 * @return A sorting of the samples based on sum of pair-wise similarities.
 * Such a sorting should correspond to homogeneity, with outliers being last
 * in the sorting.
 */
function dunnAvgSort(kw: stats.KruskalWallisResult<Indexable<number>>): number[] {
  const N = kw.size;
  const sums = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = kw.dunnsTest(i, j).effectSize;
      sums[i] += a;
      sums[j] += a;
    }
  }

  return array.fillAscending(new Array(N), 0).sort((a, b) => sums[a] - sums[b]);
}

/**
 * @returns A sorting of samples based on ranks.
 */
function kwRankSort(kw: stats.KruskalWallisResult<Indexable<number>>): number[] {
  // sort all samples by rank (ascending)
  return array
    .fillAscending(new Array<number>(kw.size), 0)
    .sort((a, b) => kw.ranks[a] - kw.ranks[b]);
}

function* window<T>(xs: Indexable<T>, k: number) {
  for (let i = 0; i + k <= xs.length; i++) {
    const m = [];

    for (let z = 0; z < k; z++) m.push(xs[i + z]);

    yield m;
  }
}
