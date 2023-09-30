import {
  Status,
  typeid,
  timer,
  stats,
  Indexable,
  array,
  iterator,
  partitioning,
  assert,
} from '@sampleci/base';
import * as ann from '../annotators.js';
import * as samples from '../samples.js';
import { Conflation } from './types.js';

export type DurationOptions = typeof defaultDurationOptions;

const defaultDurationOptions = {
  /** The maximum number of samples in the cache */
  maxCacheSize: 5,

  /**
   * Threshold of similarity for the conflation to be considered valid, between
   * 0 (maximum similarity) and 1 (completely dissimilar) inclusive.
   */
  maxEffectSize: 0.075,

  /** Minimum number of samples in a valid conflation */
  minConflationSize: 3,

  /**
   * Method to remove samples from a cache when more than the maximum
   * number are supplied.
   */
  exclusionMethod: 'outliers' as 'slowest' | 'outliers',
};

export type SampleStatus =
  /**
   * A Rejected sample due to limits on the maximum cache size. These
   * will be the 'worst' samples depending on the method used.
   */
  | 'rejected'
  /**
   * A sample not included in the conflation because it differs significantly
   * from the conflation
   */
  | 'outlier'
  /**
   * A sample which is sufficiently similar to be considered to
   * have been drawn from the same distribution.
   */
  | 'consistent';

/** A Sample conflation result based on pair-wise Mann-Whitney U tests */
export interface MWUConflationAnalysis {
  /** Sample indices ordered from 'best' to 'worst' depending on the method used. */
  stat: { index: number; status: SampleStatus }[];

  /** Effect size of the 'consistent' subset of samples */
  effectSize: number;

  /** A sufficiently large consistent subset was found */
  ready: boolean;
}

export class Duration implements Conflation<timer.HrTime> {
  static [typeid] = '@conflation:duration' as typeid;
  static is(x?: any): x is Duration {
    return x !== void 0 && x[typeid] === Duration[typeid];
  }

  readonly [typeid] = Duration[typeid];

  private opts: DurationOptions;
  private allSamples: samples.Duration[] = [];
  private rawSamples: Float64Array[] = [];
  private analysisCache?: MWUConflationAnalysis;

  constructor(initial?: Iterable<samples.Duration>, opts?: Partial<DurationOptions>) {
    this.opts = Object.assign({}, defaultDurationOptions, opts);
    if (initial !== void 0) {
      for (const x of initial) this.push(x);
    }
  }

  samples(excludeOutliers = true): samples.Duration[] {
    const samples = this.allSamples;
    const a = this.analysis();

    const subset = !excludeOutliers
      ? // exclude rejected samples
        a.stat.filter((x) => x.status !== 'rejected')
      : // exclude rejected and outlier samples
        a.stat.filter((x) => x.status === 'consistent');

    return array.subsetOf(
      samples,
      subset.map((x) => x.index),
      []
    );
  }

  analysis(): MWUConflationAnalysis {
    return (this.analysisCache ??= Duration.analyze(this.rawSamples, this.opts));
  }

  isReady(): boolean {
    return this.analysis().ready;
  }

  push(sample: samples.Duration) {
    this.allSamples.push(sample);
    this.rawSamples.push(sample.toF64Array());
    this.analysisCache = undefined;
  }

  static analyze(samples: Indexable<number>[], opts: DurationOptions): MWUConflationAnalysis {
    if (samples.length < 2) {
      return {
        stat: samples.length === 1 ? [{ index: 0, status: 'consistent' }] : [],
        ready: false,
        effectSize: 0,
      };
    }

    const N = samples.length;
    let kw = stats.kruskalWallis(samples);

    // sort all samples by pairwise-similarity or by average ranking
    const sorted = opts.exclusionMethod === 'outliers' ? dunnSort(kw) : kwRankSort(kw);

    const stat = new Map(
      iterator.map(sorted, (index) => [
        samples[index],
        { index, status: 'outlier' as SampleStatus },
      ])
    );

    // initial subset
    let subset = sorted.map((idx) => samples[idx]);

    if (N > opts.maxCacheSize) {
      // reject the outlier samples
      for (const sample of iterator.subSpan(subset, opts.maxCacheSize)) {
        stat.get(sample)!.status = 'rejected';
      }

      // from the remaining samples, compute KW again. ensure the samples
      // are in the original order
      subset = subset.slice(0, opts.maxCacheSize);
      kw = stats.kruskalWallis(subset);
    }

    if (kw.effectSize > opts.maxEffectSize && subset.length > opts.minConflationSize) {
      // try to find a cluster of samples which are consistent
      const cluster = dunnsCluster(kw, opts.minConflationSize);
      subset = array.subsetOf(samples, cluster, []);

      if (subset.length > 0) {
        kw = stats.kruskalWallis(subset);
      }
    }

    let ready = false;

    // mark consistent samples
    if (subset.length > 1 && kw.effectSize <= opts.maxEffectSize) {
      subset.forEach((sample) => (stat.get(sample)!.status = 'consistent'));
      ready = subset.length >= opts.minConflationSize;
    }

    return {
      // indices ordered by best-first
      stat: iterator.collect(stat.values()),
      effectSize: kw.effectSize,
      ready,
    };
  }
}

/**
 * @internal
 * @returns Find the densest cluster of samples of size at least minSize
 */
function dunnsCluster(kw: stats.KruskalWallisResult, minSize: number): number[] {
  const N = kw.size;
  const edges = [] as [number, number, number][];

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const p = kw.dunnsTest(i, j);
      if (p > 0) {
        edges.push([i, j, p]);
      }
    }
  }

  // sort by p-value, descending
  edges.sort((a, b) => b[2] - a[2]);

  let e = 0;
  const parents = array.fillAscending(new Int32Array(N), 0);

  do {
    if (e < edges.length) {
      const [from, to] = edges[e];
      partitioning.union(parents, from, to);

      const cc = partitioning.DisjointSet.build(parents);
      const groups = iterator.collect(cc.iterateGroups());
      groups.sort((a, b) => cc.groupSize(b) - cc.groupSize(a));

      if (cc.groupSize(groups[0]) >= minSize) {
        return iterator.collect(cc.iterateGroup(groups[0]));
      }
    } else {
      break;
    }
    e++;
  } while (true);

  return [];
}

/**
 * @return A sorting of the samples based on pair-wise similarity
 */
function dunnSort(kw: stats.KruskalWallisResult): number[] {
  const N = kw.size;
  const edges = [] as [number, number, number][];

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      edges.push([i, j, kw.dunnsTest(i, j)]);
    }
  }

  // sort by p-value, descending
  edges.sort((a, b) => b[2] - a[2]);

  const order = [] as number[];
  const degrees = new Int32Array(N);

  for (const [from, to] of edges) {
    if (degrees[from]++ === 0) {
      order.push(from);
    }
    if (degrees[to]++ === 0) {
      order.push(to);
    }
  }

  assert.eq(order.length, N);
  return order;
}

function kwRankSort(kw: stats.KruskalWallisResult): number[] {
  // sort all samples by rank (ascending)
  return array
    .fillAscending(new Array<number>(kw.size), 0)
    .sort((a, b) => kw.ranks[a] - kw.ranks[b]);
}

export const annotations = {
  /** The conflation is ready for further analysis */
  isReady: 'conflation:ready' as typeid,

  /**
   * A summary of the cache status. Legend:
   *
   *   <consistent subset>/<total samples> (<Kruskal-Wallis effect-size>)
   *
   */
  summaryText: 'duration:conflation:summaryText' as typeid,
} as const;

ann.register('@conflation:duration-annotator' as typeid, {
  annotations() {
    return Object.values(annotations);
  },

  annotate(
    confl: Conflation<timer.HrTime>,
    _request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (!Duration.is(confl)) return Status.value(void 0);

    const analysis = confl.analysis();

    let outlier = 0,
      consistent = 0;

    analysis.stat.forEach((x) => {
      switch (x.status) {
        case 'consistent':
          consistent++;
          break;
        case 'outlier':
          outlier++;
          break;
        case 'rejected':
          break;
      }
    });

    const summary = `${consistent}/${outlier + consistent} (${analysis.effectSize.toFixed(2)})`;

    const bag = ann.DefaultBag.from([
      [annotations.summaryText, summary],
      [annotations.isReady, confl.isReady()],
    ]);

    return Status.value(bag);
  },
});
