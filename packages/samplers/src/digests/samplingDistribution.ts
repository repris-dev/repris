import {
  random,
  Status,
  typeid,
  uuid,
  quantity as q,
  assert,
  quantity,
  stats,
  lazy,
  array,
  math
} from '@repris/base';

import { duration } from '../samples.js';
import * as wt from '../wireTypes.js';
import * as annotators from '../annotators.js';
import * as types from './types.js';

export type Options = types.DigestOptions & {
  powerLevel: number;
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
   * The minimum detectable effect of the consistent subset at the
   * configured power level.
   */
  mde: number;
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
      mde: wt.uncertainty,
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
    return this._aggregation.mde;
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
      uncertainty: this._aggregation.mde,
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
      mde: 0,
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
  let mde = 0;

  {
    const xsTmp = subset.map(w => w.statistic);
    const os = stats.online.Gaussian.fromValues(xsTmp);

    // minimum detectable effect given the configured power level and significance
    // as a proportion of the mean
    mde =
      stats.normal.mdes(0.99, opts.powerLevel, os.N(), os.std(1), os.N(), os.std(1)) / os.mean();

      {
        const m = stats.median(xsTmp);
        const sensitivity = 0.01;

        const q = math.gss((es) => {
          
          const result = stats.kruskalWallis([
            xsTmp, xsTmp.map(x => x + es)
          ]);

          const y = (result.pValue() - sensitivity) ** 2;
          //console.info(es, result.pValue(), y);

          return y;
        }, m * 0.001, m * 0.5, m * 0.001, 100);
        
        console.info('mde', mde.toFixed(4), ((q[0] + q[1]) / 2 / m).toFixed(4));
      }

    // Sort by distance from the mean as the measure of centrality
    stat = stat.sort(
      (a, b) => Math.abs(a.statistic - os.mean()) - Math.abs(b.statistic - os.mean()),
    );
  }

  // mark consistent samples
  if (subset.length >= opts.minSize && mde <= opts.requiredEffectSize) {
    subset.forEach(x => (x.status = 'consistent'));
  }

  return {
    stat,
    mde,
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

  // std. Devs from the mean for each sample
  const sigmas = new Float64Array(N);

  {
    const xsTmp = xs.slice();
    let { mode: centralPoint } = stats.mode.shorth(xsTmp, 0.67);

    const p = 0.99;
    const ci = stats.bootstrap.confidenceInterval(xs, stats.median, p, 1500, void 0, entropy);

    let std = Math.sqrt(N) * (ci[1] - ci[0]) / (stats.normal.ppf(.5 + p / 2) * 2);
    std /= Math.sqrt(Math.PI / 2);

    const mde = stats.normal.mdes(p, .8, N, std, N, std) / centralPoint;
console.info('>>', mde)

    if (std > 0) {
      for (let i = 0; i < N; i++) {
        // weight by distance from the median, normalized by
        // estimate of standard deviation. essentially a 'modified z-score'
        // where weights are constant up to 3 s.d. and rapidly increase
        // beyond 4 s.d.
        const z = Math.abs(xs[i] - centralPoint) / std;
        const weight = Math.max(0, z - 1.5);

        // 1+100^{\ln\left(\max\left(0,\ x-1.5\right)\right)-1.5}
        sigmas[i] = 1 + 1e2 ** (Math.log(weight) - 1.5);
      }
    } else {
      // equal weights
      array.fill(sigmas, 1 / N);
    }
  }

  // A lazy list of index-pointers constructing a tour of all items,
  // ordered by centrality
  const tour: () => array.ArrayView<number> = lazy(() => {
    // sorting of keys by weight descending
    const order = array.iota(new Int32Array(N), 0).sort((a, b) => sigmas[b] - sigmas[a]);

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
