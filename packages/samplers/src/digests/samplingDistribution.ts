import {
  random,
  Status,
  typeid,
  uuid,
  quantity as q,
  assert,
  quantity,
  Indexable,
  stats,
  lazy,
  array,
} from '@repris/base';

import { duration } from '../samples.js';
import * as wt from '../wireTypes.js';
import * as annotators from '../annotators.js';
import * as types from './types.js';

export type Options = types.DigestOptions & {
  /** The location estimation statistic to create a sampling distribution from */
  locationEstimationType: typeid;
};

type DistributionDigestWT = wt.BenchmarkDigest & {
  statistic: number[];
};

/** Create a digest from the given samples */
export function process(
  samples: Iterable<[duration.Duration, wt.AnnotationBag | undefined]>,
  opts: Options,
  entropy?: random.Generator,
): Status<Digest> {
  const points = [] as [number, duration.Duration][];
  for (const [sample, bag] of samples) {
    if (bag !== void 0 && bag[opts.locationEstimationType]) {
      const anno = annotators.fromJson(bag[opts.locationEstimationType]);
      const val = quantity.isQuantity(anno) ? anno.scalar : Number(anno);
      points.push([Number(val), sample]);
    } else {
      // todo: annotate the sample
      return Status.err(
        `Sample could not be digested. Annotation '${opts.locationEstimationType}' is missing`,
      );
    }
  }

  const aggregation = aggregateAndFilter(points, opts, entropy);
  const summary = summarize(aggregation.stat);
  const isReady = summary.consistent >= opts.minSize;

  return Status.value(new Digest(isReady, aggregation));
}

export class Digest implements types.Digest<duration.Duration> {
  static [typeid] = '@digest:duration' as typeid;

  static is(x?: any): x is Digest {
    return x !== void 0 && x[typeid] === Digest[typeid];
  }

  static fromJson(obj: wt.BenchmarkDigest, refs: Map<uuid, duration.Duration>): Status<Digest> {
    if (obj['@type'] !== Digest[typeid]) {
      return Status.err('Not a valid digest type');
    }

    const wt = obj as DistributionDigestWT;

    let stat = [];
    for (const s of wt.samples) {
      const ref = s['@ref'];

      if (!refs.has(ref)) {
        return Status.err(`Unresolved reference to sample: "${ref}"`);
      }

      stat.push({
        sample: refs.get(ref)!,
        status: (s.outlier ? 'outlier' : 'consistent') as types.DigestedSampleStatus,
      });
    }

    const result = new Digest(wt.isReady, {
      relativeSpread: wt.uncertainty,
      samplingDistribution: wt.statistic,
      stat,
    });

    result._uuid = wt['@uuid'];

    return Status.value(result);
  }

  readonly [typeid] = Digest[typeid];
  private _uuid!: uuid;

  get [uuid]() {
    if (!this._uuid) {
      this._uuid = random.newUuid();
    }
    return this._uuid;
  }

  constructor(
    private _isReady: boolean,
    private _aggregation: SamplingAggregation<duration.Duration>,
  ) {}

  N() {
    return this._aggregation.stat.length;
  }

  stat() {
    return this._aggregation.stat;
  }

  uncertainty(): number {
    return this._aggregation.relativeSpread;
  }

  ready(): boolean {
    return this._isReady;
  }

  /** Convert a sample value as a quantity */
  asQuantity(value: number): q.Quantity {
    // just use the first sample to convert a value
    assert.gt(this._aggregation.stat.length, 0);
    return this._aggregation.stat[0].sample.asQuantity(value);
  }

  samplingDistribution(): number[] {
    return this._aggregation.samplingDistribution;
  }

  toJson(): DistributionDigestWT {
    const samples = this._aggregation.stat
      // filter samples which were excluded from the analysis
      .filter(s => s.status !== 'rejected')
      .map(s => ({
        '@ref': s.sample[uuid],
        outlier: s.status !== 'consistent',
      }));

    return {
      '@type': this[typeid],
      '@uuid': this[uuid],
      samples,
      uncertainty: this._aggregation.relativeSpread,
      statistic: this._aggregation.samplingDistribution,
      isReady: this._isReady,
    };
  }
}

function summarize(stat: { status: types.DigestedSampleStatus }[]) {
  const result: Record<types.DigestedSampleStatus, number> = {
    consistent: 0,
    outlier: 0,
    rejected: 0,
  };

  for (const s of stat) result[s.status]++;
  return result;
}

export type SamplingAggregation<T> = {
  /** Status/classification of each sample */
  stat: { sample: T; status: types.DigestedSampleStatus }[];

  /** Sampling distribution of the consistent subset, if any */
  samplingDistribution: number[];

  /** The Coefficient of variation of the consistent subset */
  relativeSpread: number;
};

/**
 * Creates a digest of samples based on analysis of their sampling
 * distribution, excluding outliers
 */
function aggregateAndFilter<T>(
  taggedPointEstimates: [pointEstimate: number, tag: T][],
  opts: types.DigestOptions,
  entropy?: random.Generator,
): SamplingAggregation<T> {
  const N = taggedPointEstimates.length;

  if (N < 2) {
    // prettier-ignore
    const stat = N === 1
      ? [{ sample: taggedPointEstimates[0][1], status: 'consistent' as types.DigestedSampleStatus }]
      : [];

    return {
      stat,
      relativeSpread: 0,
      samplingDistribution: [taggedPointEstimates[0][0]],
    };
  }

  // Sampling distribution, sorted by hsm;
  let stat = taggedPointEstimates.map(([pointEst, tag]) => ({
    sample: tag,
    statistic: pointEst,
    status: 'outlier' as types.DigestedSampleStatus,
  }));

  // Sorting of the sampling distribution, distance from mean (desc)
  let subset = stat.slice();

  if (N > opts.maxSize) {
    // reject the outlier sample(s)
    const rejector = createOutlierSelection(subset, s => s.statistic, entropy);

    for (let n = N; n > opts.maxSize; n--) {
      const s = rejector();
      assert.isDefined(s);
      s.status = 'rejected';
    }

    // remove the rejected samples
    subset = subset.filter(s => s.status !== 'rejected');
    assert.eq(subset.length, opts.maxSize);
  }

  const samplingDistribution = subset.map(x => x.statistic);
  let relativeSpread = 0;

  {
    const xsTmp = subset.map(w => w.statistic);
    const os = stats.online.Gaussian.fromValues(xsTmp);

    // Spread as the coefficient of variation
    // Use 1.5 ddof Rule of Thumb
    // See: Richard M. Brugger, "A Note on Unbiased Estimation on the Standard Deviation",
    // The American Statistician (23) 4 p. 32 (1969)
    relativeSpread = os.cov(1.5);

    // Sort by distance from the mean as the measure of centrality
    stat = stat.sort(
      (a, b) => Math.abs(a.statistic - os.mean()) - Math.abs(b.statistic - os.mean()),
    );
  }

  // mark consistent samples
  if (subset.length >= opts.minSize && relativeSpread <= opts.maxUncertainty) {
    subset.forEach(x => (x.status = 'consistent'));
  }

  return {
    stat,
    relativeSpread,
    samplingDistribution,
  };
}

export function createOutlierSelection<T>(
  keys: Indexable<T>,
  toScalar: (k: T) => number,
  entropy = random.PRNGi32(),
): () => T | undefined {
  const N = keys.length,
    xs = new Float64Array(N);
  for (let i = 0; i < N; i++) xs[i] = toScalar(keys[i]);

  // std. Devs from the mean for each sample
  const sigmas = new Float64Array(N);

  {
    // Mean: mean of the narrowest 50% of the distribution (shorth)
    // std dev.: median absolute deviation from the mean
    const xsTmp = xs.slice();
    const mean = stats.mode.shorth(xsTmp).mode,
      std = stats.mad(xsTmp, mean).normMad;

    if (std > 0) {
      // weight by distance from the median, normalized by
      // estimate of standard deviation
      for (let i = 0; i < N; i++) {
        sigmas[i] = Math.abs(xs[i] - mean) / std;
      }
    }
  }

  // A lazy list of index-pointers constructing a tour of all items,
  // ordered by centrality
  const tour: () => Indexable<number> = lazy(() => {
    // sorting of keys by weight descending
    const order = array.fillAscending(new Int32Array(N), 0).sort((a, b) => sigmas[b] - sigmas[a]);

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
