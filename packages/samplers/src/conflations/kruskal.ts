import { stats, Indexable, array, iterator, assert } from '@repris/base';

import { AnalysisOptions, ConflatedSampleStatus } from './types.js';

export interface KWOptions extends AnalysisOptions {
  /**
   * Method to remove samples from a cache when more than the maximum
   * number are supplied.
   */
  exclusionMethod: 'slowest' | 'outliers';

  inputOrder?: 'oldestFirst',
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
  readonly kw: stats.KruskalWallisResult | undefined;
  readonly raw: Indexable<number>[];

  constructor(private taggedSamples: [sample: Indexable<number>, tag: T][]) {
    const N = taggedSamples.length;

    this.raw = taggedSamples.map(x => x[0]);
    this.kw = N >= 2 ? stats.kruskalWallis(this.raw) : void 0;
  }

  conflate(opts: KWOptions): KWConflationResult<T> {
//    const concordanceThres = 0.05;
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
    const sortedIndices = opts.exclusionMethod === 'outliers' ? dunnAvgSort(kw) : kwRankSort(kw);
    const sortedSamples = sortedIndices.map(idx => rawSamples[idx]);

    const statIndex = new Map(
      iterator.map(sortedIndices, index => [
        rawSamples[index],
        { sample: samples[index][1], status: 'outlier' as ConflatedSampleStatus },
      ])
    );

    // consistent subset
    let subset = rawSamples.slice();

    if (N > opts.maxSize) {
      // reject the outlier samples
      for (const s of sortedSamples.slice(opts.maxSize)) {
        statIndex.get(s)!.status = 'rejected';
      }

      // from the remaining samples, compute KW again.
      subset = sortedSamples.slice(0, opts.maxSize);
      kw = stats.kruskalWallis(subset);

      console.info('s>', sortedIndices);

      // reject the oldest sample if it is fastest and doing so gives a sufficiently
      // small effect-size
//      if (kw.effectSize > concordanceThres && opts.inputOrder === 'oldestFirst' && sortedIndices[0] === 0) {
//        const kwPrev = kw.effectSize;
//        
//        const subset1 = rawSamples.slice(N - opts.maxSize);
//        const kw1 = stats.kruskalWallis(subset1);
//
//        if (kw1.effectSize < concordanceThres) {
//          subset = subset1;
//          kw = kw1;
//        }
//
//        console.info('>>', kwPrev, kw1.effectSize);
//      }
    }

    if (kw.effectSize > opts.maxEffectSize && N > opts.minSize) {
      console.info('>>', kw.effectSize, N, opts.minSize);
      for (let i = 0; i < N - opts.minSize; i++) {
        const s = sortedSamples.slice(i, i + opts.minSize);
        const kw1 = stats.kruskalWallis(s);

        console.info('kw1', i, N - opts.minSize, kw1.effectSize);

        if (kw1.effectSize <= opts.maxEffectSize) {
          subset = s;
          kw = kw1;
          break;
        }
      }
    }

    // mark consistent samples
    if (subset.length >= opts.minSize && kw.effectSize <= opts.maxEffectSize) {
      subset.forEach(sample => (statIndex.get(sample)!.status = 'consistent'));
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
function dunnAvgSort(kw: stats.KruskalWallisResult): number[] {
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
function kwRankSort(kw: stats.KruskalWallisResult): number[] {
  // sort all samples by rank (ascending)
  return array
    .fillAscending(new Array<number>(kw.size), 0)
    .sort((a, b) => kw.ranks[a] - kw.ranks[b]);
}
