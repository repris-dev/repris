import { stats, Indexable, array, iterator, assert } from '@repris/base';

import { AnalysisOptions, ConflatedSampleStatus } from './types.js';

export interface KWOptions extends AnalysisOptions {
  /**
   * Method to remove samples from a cache when more than the maximum
   * number are supplied.
   */
  exclusionMethod: 'slowest' | 'outliers';
}

export type KWConflationResult<T> = {
  /** Status of each sample */
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

    const statIndex = new Map(
      iterator.map(sortedIndices, index => [
        rawSamples[index],
        { sample: samples[index][1], status: 'outlier' as ConflatedSampleStatus },
      ])
    );

    // consistent subset
    let subset = rawSamples.slice();

    if (N > opts.maxSize) {
      const sortedSamples = sortedIndices.map(idx => rawSamples[idx]);

      // reject the outlier samples
      for (const s of sortedSamples.slice(opts.maxSize)) {
        statIndex.get(s)!.status = 'rejected';
      }

      // from the remaining samples, compute KW again.
      subset = sortedSamples.slice(0, opts.maxSize);
      kw = stats.kruskalWallis(subset);
    }

    // mark consistent samples
    if (subset.length > 1 && kw.effectSize <= opts.maxEffectSize) {
      subset.forEach(sample => (statIndex.get(sample)!.status = 'consistent'));
    }

    const stat = iterator.collect(statIndex.values());

    return {
      stat,
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
