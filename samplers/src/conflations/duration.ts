import {
  Status,
  typeid,
  timer,
  stats,
  assert,
  Indexable,
  array,
  iterator,
} from '@sampleci/base';
import * as ann from '../annotators.js';
import * as samples from '../samples.js';
import { Conflation } from './types.js';

export type DurationOptions = typeof defaultDurationOptions;

const defaultDurationOptions = {
  /** The maximum number of samples in the conflation */
  maxSize: 5,

  /**
   * Threshold of similarity for the conflation to be considered valid, between
   * 0 (completely dissimilar) and 1 (maximum similarity).
   */
  minSimilarity: 0.5,

  /**
   * Method to remove samples from a conflation when more than the maximum
   * number are supplied.
   */
  exclusionMethod: 'outliers' as 'slowest' | 'outliers',
};

/** A Sample conflation result based on pair-wise Mann-Whitney U tests */
interface MWUConflationAnalysis {
  /** Sample indices ordered from 'best' to 'worst' depending on the method used. */
  ordered: number[];

  /**
   * Samples excluded These will be the slowest
   * samples in the conflation.
   */
  excluded: number[];

  /** Sample indices of samples which are sufficiently similar */
  consistentSubset: number[];
}

export class Duration implements Conflation<timer.HrTime> {
  static [typeid] = '@conflation:duration' as typeid;

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
    const maxSize = this.opts.maxSize;
    const samples = this.allSamples;

    const a = this.analysis();
    if (!excludeOutliers) {
      return samples.length > maxSize
        ? array.subsetOf(samples, a.ordered.slice(0, maxSize), [])
        : samples;
    }

    return array.subsetOf(samples, a.consistentSubset, []);
  }

  analysis(): MWUConflationAnalysis {
    return (this.analysisCache ??= Duration.analyze(this.rawSamples, this.opts));
  }

  push(sample: samples.Duration) {
    this.allSamples.push(sample);
    this.rawSamples.push(sample.toF64Array());
    this.analysisCache = undefined;
  }

  static analyze(samples: Indexable<number>[], opts: DurationOptions): MWUConflationAnalysis {
    if (samples.length === 0) {
      return {
        ordered: [],
        excluded: [],
        consistentSubset: [],
      };
    }

    return opts.exclusionMethod === 'outliers'
      ? analyzeByOutliers(samples, opts)
      : analyzeByFastest(samples, opts);
  }
}

type MWUEdge = [adx: number, bdx: number, mwu: number];

/**
 * @internal
 * @returns Edges tagged with effect sizes of each sample pair,
 * between -1 and 1
 */
export function allPairsMWU(samples: Indexable<number>[]): MWUEdge[] {
  const N = samples.length;
  const edges = [] as MWUEdge[];

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const mwu = 2 * (stats.mwu(samples[i], samples[j]).effectSize - 0.5);
      edges.push([i, j, mwu]);
    }
  }

  return edges;
}

function similarityMean(N: number, comparisons: MWUEdge[], subset: Int32Array) {
  const weights = new Float32Array(N);
  subset.forEach((idx) => (weights[idx] = 1));

  let mean = 0;
  for (const [a, b, mwu] of comparisons) {
    const w = weights[a] * weights[b];
    mean += (1 - Math.abs(mwu)) * w;
  }

  const K = subset.length;
  mean /= (K * (K - 1)) / 2;

  assert.inRange(mean, 0, 1);
  return mean;
}

function analyzeByOutliers(
  samples: Indexable<number>[],
  opts: DurationOptions
): MWUConflationAnalysis {
  const N = samples.length;
  const edges = allPairsMWU(samples);

  let consistentSubset = new Int32Array(N);
  array.fillAscending(consistentSubset, 0);

  const outliers = [] as number[];
  const sum = new Float32Array(N);

  // iteratively remove the outlier sample
  while (consistentSubset.length > 2 && consistentSubset.length > opts.maxSize) {
    sum.fill(0);

    // reduce the subset by one via leave-one-out cross validation
    for (let n = 0; n < consistentSubset.length; n++) {
      const i = consistentSubset[n];
      for (const [a, b, mwu] of edges) {
        if (a !== i && b !== i) {
          // symmetric similarity
          sum[n] += 1 - Math.abs(mwu);
        }
      }
    }

    // extract the sample that produces the highest similarity sum (in its absence) and is
    // thus the largest outlier
    consistentSubset.sort((a, b) => sum[a] - sum[b]);
    outliers.push(consistentSubset[consistentSubset.length - 1]);
    consistentSubset = consistentSubset.subarray(0, -1);
  }

  assert.eq(N, consistentSubset.length + outliers.length);
  const mean = similarityMean(N, edges, consistentSubset);

  return {
    ordered: Array.from(iterator.concat([consistentSubset, outliers])),
    excluded: Array.from(outliers),
    consistentSubset: mean >= opts.minSimilarity ? Array.from(consistentSubset) : [],
  };
}

function analyzeByFastest(
  samples: Indexable<number>[],
  opts: DurationOptions
): MWUConflationAnalysis {
  const N = samples.length;
  const edges = allPairsMWU(samples);

  // Mann-whitney U is not transitive, and so a full ordering of all sample pairs
  // is not possible. Instead we order by the sum of 'win' effect sizes in pair-wise
  // comparisons.
  const wins = new Float32Array(N);

  edges.forEach(([a, b, mwu]) => {
    wins[a] += mwu;
    wins[b] -= mwu;
  });

  // sort all samples by wins
  const orderByWins = new Int32Array(N);

  array.fillAscending(orderByWins, 0);
  orderByWins.sort((a, b) => wins[b] - wins[a]);

  const consistentSubset = orderByWins.subarray(0, opts.maxSize);
  const mean = similarityMean(N, edges, consistentSubset);

  return {
    ordered: Array.from(orderByWins),
    excluded: Array.from(orderByWins.subarray(opts.maxSize)),
    consistentSubset: mean >= opts.minSimilarity ? Array.from(consistentSubset) : [],
  };
}

const annotations = {
  /** The number of samples selected for the conflation */
  includedCount: 'duration:conflation:includedCount' as typeid,

  /** The number of samples excluded from the conflation */
  excludedCount: 'duration:conflation:excludedCount' as typeid,

  /**
   * A symbolic summary of the conflation. Legend:
   *
   *   . - sample in the conflation, not included for analysis
   *   * - Sample in the conflation, included for analysis
   *   x - Sample removed because of size limits or poor quality
   */
  summaryText: 'duration:conflation:summaryText' as typeid,
};

ann.register('@conflation:duration-annotator' as typeid, {
  annotations() {
    return Object.values(annotations);
  },

  annotate(
    sample: Conflation<timer.HrTime>,
    _request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (sample[typeid] !== Duration[typeid]) {
      return Status.value(void 0);
    }

    const c = sample as Duration;
    const analysis = c.analysis();

    const summary = Array.from(
      iterator.take(
        analysis.ordered.length,
        iterator.gen(() => '·')
      )
    );

    analysis.excluded.forEach((idx) => (summary[idx] = '×'));
    analysis.consistentSubset.forEach((idx) => (summary[idx] = '✓'));

    const bag = ann.DefaultBag.from([[annotations.summaryText, summary.join('')]]);
    return Status.value(bag);
  },
});
