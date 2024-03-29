import {
  random,
  Status,
  typeid,
  uuid,
  quantity as q,
  assert,
  quantity,
  stats,
  array,
} from '@repris/base';

import { duration } from '../samples.js';
import * as wt from '../wireTypes.js';
import * as annotators from '../annotators.js';
import * as types from './types.js';

export type Options = types.DigestOptions & {
  powerLevel: number;
  sensitivity: number;
};

type DistributionDigestWT = wt.BenchmarkDigest & {
  statistic: number[];
};

export type SamplingAggregation<T> = {
  /** Status/classification of each sample */
  stat: { sample: T; status: types.DigestedSampleStatus }[];

  /** Sampling distribution of the consistent subset, if any */
  samplingDistribution: number[];

  /**
   * The minimum detectable effect-size of the consistent subset at the
   * configured power level.
   */
  mdes: number;
};

export const NoisySample = 'sample:noisy' as typeid;

/** Create a digest from the given samples */
export function processSamples(
  samples: Iterable<[duration.Duration, wt.AnnotationBag | undefined]>,
  opts: Options,
  entropy?: random.Generator,
): Status<Digest> {
  const points = [] as [number, duration.Duration][];
  const noisySamples = [] as duration.Duration[];

  for (const [sample, bag] of samples) {
    if (bag !== void 0 && bag[NoisySample]) {
      // filter out samples branded as noisy
      noisySamples.push(sample);
    } else if (bag !== void 0 && bag[opts.locationEstimationType]) {
      // get the location estimate to analyze
      const locationStat = annotators.fromJson(bag[opts.locationEstimationType]);
      const val = quantity.isQuantity(locationStat) ? locationStat.scalar : Number(locationStat);
      points.push([Number(val), sample]);
    } else {
      // todo: annotate the sample here
      return Status.err(
        `Sample could not be digested. Annotation '${opts.locationEstimationType}' is missing`,
      );
    }
  }

  const aggregation = aggregateAndFilter(points, opts, entropy);
  noisySamples.forEach(sample => aggregation.stat.push({ sample, status: 'rejected' }));

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
      mdes: wt.mdes,
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

  mdes(): number {
    return this._aggregation.mdes;
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
      mdes: this._aggregation.mdes,
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

/**
 * Creates a digest of samples based on analysis of their sampling
 * distribution, excluding outliers
 */
function aggregateAndFilter<T>(
  taggedPointEstimates: [pointEstimate: number, tag: T][],
  opts: Options,
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
      mdes: 0,
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

  // (relative) Minimum Detectable Effect (MDE) given the configured power level
  // and significance as a proportion of the median
  let mdes = 0;

  {
    const xsTmp = array.sort(subset.map(w => w.statistic));
    const m = stats.median(xsTmp, true);

    // Estimate the std-err of the median
    const stdErr = stats.bootstrap.bootStat(xsTmp, xs => stats.median(xs, true), 1500).std();

    // convert std-err of the median to standard deviation.
    // SE(median) is ~1.25x SE(mean)
    const std = (Math.sqrt(N) * stdErr) / Math.sqrt(Math.PI / 2);

    mdes = stats.normal.mde(opts.sensitivity, opts.powerLevel, N, std) / m;

    // Sort by distance from the median as the measure of centrality
    stat = stat.sort((a, b) => Math.abs(a.statistic - m) - Math.abs(b.statistic - m));
  }

  // mark consistent samples
  if (subset.length >= opts.minSize && mdes <= opts.minEffectSize) {
    subset.forEach(x => (x.status = 'consistent'));
  }

  return {
    stat,
    mdes,
    samplingDistribution,
  };
}

export function createOutlierSelection<T>(
  keys: array.ArrayView<T>,
  toScalar: (k: T) => number,
  entropy = random.PRNGi32(),
): () => T | undefined {
  const N = keys.length,
    xs = new Float64Array(N);

  for (let i = 0; i < N; i++) xs[i] = toScalar(keys[i]);

  // std. Devs from the median for each sample
  const weights = new Float64Array(N);

  {
    const xsTmp = xs.slice();
    const centralPoint = stats.median(xsTmp);
    const std = stats.mad(xsTmp, centralPoint).normMad;

    if (std > 0) {
      for (let i = 0; i < N; i++) {
        // weight by distance from the median, normalized by
        // estimate of standard deviation. Essentially a 'modified z-score'
        // where weights are constant up to 3 s.d. and rapidly increase
        // beyond 4 s.d.
        const z = Math.abs(xs[i] - centralPoint) / std;
        const weight = Math.max(0, z - 1);

        // 1+100^{\ln\left(\max\left(0,\ x-1.25\right)\right)-1.25}
        weights[i] = 1 + 1e2 ** (Math.log(weight) - 1);
      }
    } else {
      // equal weights
      array.fill(weights, 1 / N);
    }
  }

  const dist = random.discreteDistribution(weights, entropy);

  let totSeen = 0;

  return () => {
    // filtered everything?
    if (totSeen >= N) return void 0;

    let idx = dist();

    totSeen++;
    dist.reweight(idx, 0);

    return keys[idx];
  };
}
