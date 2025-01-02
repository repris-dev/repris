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
import * as ann from '../annotators.js';
import * as types from './types.js';

export type Options = types.DigestOptions;

type DistributionDigestWT = wt.BenchmarkDigest & {
  statistic: number[];
};

export type SamplingAggregation<T> = {
  /** Status/classification of each sample */
  stat: { sample: T; rejected?: boolean }[];

  /** Sampling distribution of the consistent subset, if any */
  samplingDistribution: number[];

  /** normality significance level of the consistent subset */
  normality: number;
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
      const locationStat = ann.fromJson(bag[opts.locationEstimationType]);
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
  noisySamples.forEach(sample => aggregation.stat.push({ sample, rejected: true }));

  return Status.value(new Digest(aggregation));
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
        rejected: s.rejected
      });
    }

    const result = new Digest({
      samplingDistribution: wt.statistic,
      normality: wt.normality,
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
    private _aggregation: SamplingAggregation<duration.Duration>,
  ) {}

  N() {
    return this._aggregation.stat.length;
  }

  stat() {
    return this._aggregation.stat;
  }

  normality(): number {
    return this._aggregation.normality;
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
      .filter(s => s.rejected !== true)
      .map(s => ({
        '@ref': s.sample[uuid],
      }));

    return {
      '@type': this[typeid],
      '@uuid': this[uuid],
      samples,
      statistic: this._aggregation.samplingDistribution,
      normality: this._aggregation.normality,
    };
  }
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
      ? [{ sample: taggedPointEstimates[0][1] }]
      : [];

    // single sample summary statistic
    const samplingDistribution = N > 0
      ? [taggedPointEstimates[0][0]]
      : [];

    return {
      stat,
      normality: 0,
      samplingDistribution
    };
  }

  // Sampling distribution, sorted by hsm;
  let stat = taggedPointEstimates.map(([pointEst, tag]) => ({
    sample: tag,
    rejected: false,
    statistic: pointEst,
  }));

  // Sorting of the sampling distribution, distance from mean (desc)
  let subset = stat.slice();

  if (N > opts.maxSize) {
    // reject the outlier sample(s)
    const rejector = createOutlierSelection(subset, s => s.statistic, entropy);

    for (let n = N; n > opts.maxSize; n--) {
      const s = rejector();
      assert.isDefined(s);
      s.rejected = true;
    }

    // remove the rejected samples
    subset = subset.filter(s => s.rejected !== true);
    assert.eq(subset.length, opts.maxSize);
  }

  const samplingDistribution = subset.map(x => x.statistic);

  // normality significance
  let normalitySignificance = 0;

  {
    // pre-sort the sample to speed up the (median) bootstrap
    const xsTmp = array.sort(samplingDistribution.slice());

    if (xsTmp.length >= 3) {
      normalitySignificance = xsTmp[xsTmp.length - 1] - xsTmp[0] > opts.maxPrecision 
        ? stats.shapiro.shapiroWilk(xsTmp).pValue
        : 1;
    }
  }

  return {
    stat,
    normality: normalitySignificance,
    samplingDistribution,
  };
}

export function createOutlierSelection<T>(
  keys: array.ArrayView<T>,
  toStatistic: (k: T) => number,
  entropy = random.PRNGi32(),
): () => T | undefined {
  const N = keys.length, xs = new Float64Array(N);

  for (let i = 0; i < N; i++) xs[i] = toStatistic(keys[i]);

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
    totSeen++;

    const idx = dist();
    dist.reweight(idx, 0);

    return keys[idx];
  };
}

const Annotations = {
  /** P-value of the distribution. */
  normality: 'digest:normality:p' as typeid,

  /** size of the sampling distribution */
  size: 'digest:n' as typeid,
};

ann.register('@digests:sampling-distribution-annotator' as typeid, {
  annotations() {
    return Object.values(Annotations);
  },

  annotate(
    digest: types.Digest<any>,
    _request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    if (!Digest.is(digest)) {
      return Status.value(void 0);
    }

    const bag = ann.DefaultBag.from([
      [Annotations.normality, digest.normality()],
      [Annotations.size, digest.N()],
    ]);

    return Status.value(bag);
  },
});
