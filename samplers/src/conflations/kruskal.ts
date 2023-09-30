import { stats, Indexable, array, iterator, partitioning, assert } from '@repris/base';

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

  /** Sums of samples by conflation status */
  summary: Record<ConflatedSampleStatus, number>;

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
        summary: this.summarize(stat),
        effectSize: 0,
      };
    }

    assert.isDefined(kw);

    // sort all samples by pairwise-similarity or by average ranking
    const sorted = opts.exclusionMethod === 'outliers' ? dunnAvgSort(kw) : kwRankSort(kw);

    const statIndex = new Map(
      iterator.map(sorted, index => [
        rawSamples[index],
        { sample: samples[index][1], status: 'outlier' as ConflatedSampleStatus },
      ])
    );

    // consistent subset
    let subset = rawSamples.slice();

    if (N > opts.maxSize) {
      const sortedSamples = sorted.map(idx => rawSamples[idx]);

      // reject the outlier samples
      for (const s of sortedSamples.slice(opts.maxSize)) {
        statIndex.get(s)!.status = 'rejected';
      }

      // from the remaining samples, compute KW again.
      subset = sortedSamples.slice(0, opts.maxSize);
      kw = stats.kruskalWallis(subset);
    }

    if (kw.effectSize > opts.maxEffectSize && subset.length > opts.minSize) {
      // try to find a cluster of samples which are consistent
      const cluster = dunnsCluster(kw, opts.maxEffectSize);
      subset = array.subsetOf(subset, cluster, []);

      if (subset.length > 1) {
        kw = stats.kruskalWallis(subset);
      }
    }

    // mark consistent samples
    if (subset.length > 1 && kw.effectSize <= opts.maxEffectSize) {
      subset.forEach(sample => (statIndex.get(sample)!.status = 'consistent'));
    }

    const stat = iterator.collect(statIndex.values());

    return {
      stat,
      summary: this.summarize(stat),
      effectSize: kw.effectSize,
    };
  }

  private summarize(stat: { sample: T; status: ConflatedSampleStatus }[]) {
    const result: Record<ConflatedSampleStatus, number> = {
      consistent: 0,
      outlier: 0,
      rejected: 0,
    };

    for (const s of stat) result[s.status]++;
    return result;
  }
}

/**
 * @returns Find the largest, densest cluster of samples
 */
function dunnsCluster(kw: stats.KruskalWallisResult, minEffectSize: number): number[] {
  const N = kw.size;
  const parents = array.fillAscending(new Int32Array(N), 0);
  // effect-size sums
  const sums = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const es = kw.dunnsTest(i, j).effectSize;
      if (es <= minEffectSize) {
        partitioning.union(parents, i, j);
      }

      // The sum of all edges, not just those within components
      sums[i] += es;
      sums[j] += es;
    }
  }

  const cc = partitioning.DisjointSet.build(parents);
  const groups = iterator.collect(cc.iterateGroups());

  for (const g of groups) {
    let sum = 0;

    for (const gi of cc.iterateGroup(g)) {
      sum += sums[gi];
      sums[gi] = 0;
    }

    sums[g] = sum;
  }

  // Sort by component size, then sum of effect sizes
  groups.sort((a, b) => {
    const size = cc.groupSize(b) - cc.groupSize(a);
    return size === 0 ? sums[a] - sums[b] : size;
  });

  // if the largest connected component is big enough, return it
  const g = iterator.collect(cc.iterateGroup(groups[0]));
  return g.length > 1 ? g : [];
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
