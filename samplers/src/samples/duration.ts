import { Status, typeid, json, timer, stats, assert, Indexable, array, iterator } from '@sampleci/base';
import * as ann from '../annotators.js';
import * as quantity from '../quantity.js';
import * as wt from '../wireTypes.js';
import * as types from './types.js';
import { Sample } from './types.js';

/** Json representation of a duration sample */
type WireType = wt.SampleData & {
  summary: ReturnType<stats.online.Lognormal['toJson']>,
  units: quantity.Units,
  values?: string[],
  maxSize?: number,
};

function isDurationSampleWT(x: unknown): x is WireType {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;

  const obj = x as WireType;
  return obj['@type'] === Duration[typeid]
      && typeof obj.units === 'string'
      && (obj.values === void 0 || Array.isArray(obj.values));
}

/** A sample of HrTime durations in nanoseconds */
export class Duration implements types.MutableSample<timer.HrTime> {
  static [typeid] = '@sample:duration' as typeid;

  static is(x: any) {
    return x[typeid] === Duration[typeid];
  }

  readonly [typeid] = Duration[typeid];

  private times: stats.ReservoirSample<timer.HrTime>;

  // TODO: stats specifically for bigint
  private onlineStats: stats.online.Lognormal;

  constructor (
    private maxCapacity?: number,
    private significanceThreshold = 0.01
  ) {
    this.times = new stats.ReservoirSample(
      maxCapacity === void 0 ? Number.MAX_SAFE_INTEGER : maxCapacity
    );

    this.onlineStats = new stats.online.Lognormal();
  }

  sampleSize(): number {
    return this.times.N();
  }

  observationCount(): number {
    return this.onlineStats.N();
  }
  
  values() {
    return this.times.values.values();
  }

  summary(): stats.online.Lognormal {
    return this.onlineStats;
  }

  reset() {
    this.times.reset();
    this.onlineStats.reset();
  }

  push(duration: timer.HrTime) {
    this.times.push(duration);
    this.onlineStats.push(Number(duration));
  }

  significant(): boolean {
    if (this.sampleSize() >= 3) {
      const hsm = stats.mode.lms(this.toF64Array());
      return hsm.variation < this.significanceThreshold;
    }

    return false;
  }

  toF64Array(dst = new Float64Array(this.times.N())) {
    assert.gte(dst.length, this.times.N());

    let idx = 0;
    for (const t of this.times.values) {
      dst[idx++] = Number(t);
    }

    assert.eq(idx, dst.length);
    return dst;
  }

  toJson(): WireType {
    const obj: WireType = {
      '@type': Duration[typeid],
      summary: this.onlineStats.toJson(),
      values: this.times.values.map(timer.toString),
      units: 'microseconds' as quantity.Units
    };

    if (this.maxCapacity !== void 0) {
      obj.maxSize = this.maxCapacity;
    }

    return obj;
  }

  static fromJson(x: json.Value): Status<Duration> {
    if (!isDurationSampleWT(x)) {
      return Status.err(`Invalid ${ Duration[typeid] } sample`);;
    }

    const sample = new Duration(x.maxSize);
    sample.onlineStats = stats.online.Lognormal.fromJson(x.summary);

    if (Array.isArray(x.values)) {
      x.values.forEach(v => sample.times.push(timer.fromString(v)));
    }

    return Status.value(sample);
  }
}

type ConflationAgreement = {
  /** Sample indices which are in agreement */
  inAgreement: Int32Array,

  /** Degree to which the samples in agreement disagree (0..1) */
  heterogeneity: number,

  /**
   * All sample indices ordered by the number of times it is more likely to
   * produce lower values in a sample-by-sample comparison
   */
  order: Int32Array,
};

export class DurationConflation implements types.Conflation<timer.HrTime> {
  static [typeid] = '@conflation:duration' as typeid;

  readonly [typeid] = DurationConflation[typeid];

  private allSamples: Duration[] = [];
  private rawSamples: Float64Array[] = [];
  private analysisCache?: ConflationAgreement;

  constructor (private exclusionThreshold = 0.2) { }

  samples(maxSize = 5, all = false): Iterable<Duration> {
    const allSamples = this.allSamples;

    if (all && maxSize >= allSamples.length) {
      // no analysis needed
      return allSamples;
    }

    const a = this.analysis();

    const series = all
      // consider all samples
      ? Array.from(iterator.range(0, allSamples.length))
      // consider only those samples in agreement
      : a.inAgreement;

    if (maxSize < series.length) {
      // find the fastest subset
      const subset = new Set(series);
      const result = [] as Duration[];

      for (let i = 0; i < series.length; i++) {
        const idx = a.order[i];
        if (subset.has(idx)) {
          if (result.push(allSamples[idx]) >= maxSize) break;
        }
      }

      return result;
    }

    return array.subsetOf(allSamples, series, []);
  }

  analysis(): ConflationAgreement {
    return this.analysisCache ??= DurationConflation.analyze(
      this.rawSamples, this.exclusionThreshold
    );
  }

  push(sample: Duration) {
    this.allSamples.push(sample);
    this.rawSamples.push(sample.toF64Array());
    this.analysisCache = undefined;
  }

  /**
   * @returns The subset of samples in agreement with more than
   * half the other samples. Two samples agree when their distributions
   * overlap below the exclusion threshold.
   * 
   * The returned subset is ordered 
   */
  static analyze(
    samples: Indexable<number>[], exclusionThreshold: number
  ): ConflationAgreement {
    const N = samples.length;
    // degree of each sample (represented as a graph, where
    // each edge represents a pair of agreeing samples)
    const degrees = new Int32Array(N);

    // Mann-whitney U is not transitive, and so a full ordering of all sample pairs
    // is not possible. Instead we order by the number of 'wins'.
    const wins = new Int32Array(N);

    // 
    let heterogeneity = 0, e = 0;

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const mwu = stats.mwu(samples[i], samples[j]).effectSize;
        // Normalized effect-size between 0 and 1 where 0 is 'equal-chance' or homogeneous.
        const a = Math.abs(mwu - 0.5) * 2;

        if (a < exclusionThreshold) {
          heterogeneity += a;
          e++;

          degrees[i]++;
          degrees[j]++;
        }

        if (mwu > 0.5) {
          wins[i]++
        } else if (mwu < 0.5) {
          wins[j]++
        }
      }
    }

    const order = new Int32Array(N);

    array.fillAscending(order, 0);
    order.sort((a, b) => wins[b] - wins[a]);

    // min degree threshold
    const thresh = (N - 1) / 2;
    const inAgreement = order.filter(idx => degrees[idx] > thresh);

    return {
      order,
      inAgreement,
      heterogeneity: e > 0 ? heterogeneity / e : 1,
    };
  }
}

const sampleAnnotations = {
  /** Number of observations seen during sampling */
  iter: 'duration:iter' as typeid,

  /**
   * The Reservoir sample size, <= n.
   * See: https://en.wikipedia.org/wiki/Reservoir_sampling
   */
  k: 'duration:k' as typeid,

  /** Arithmetic mean of all observations */
  mean: 'duration:mean' as typeid,

  /** Bounds (minimum, maximum) of the sample */
  range: 'duration:range' as typeid,

  /** Minimum value of the sample */
  min: 'duration:min' as typeid,

  /** Maximum value of the sample */
  max: 'duration:max' as typeid,

  /** Standard deviation of all observations */
  std: 'duration:std' as typeid,

  /** Skewness of all observations */
  skew: 'duration:skew' as typeid,

  /** Kurtosis of all observations */
  kurtosis: 'duration:kurtosis' as typeid,

  /** Coefficient of variation of all observations */
  cov: 'duration:cov' as typeid,

  /** Relative margin of error */
  rme95: 'duration:rme:95' as typeid,
};

ann.register('@sample:duration-annotator' as typeid, {
  annotations() {
    return Object.values(sampleAnnotations);
  },

  annotate(
    sample: Sample<unknown>,
    _request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (sample[typeid] !== Duration[typeid]) {
      return Status.value(void 0);
    }

    const d = (sample as Duration);
    const s = d.summary();

    const bag = ann.DefaultBag.from([
      [sampleAnnotations.iter, d.observationCount()],
      [sampleAnnotations.k, d.sampleSize()],
      [sampleAnnotations.mean, s.mean()],
      [sampleAnnotations.skew, s.skewness()],
      [sampleAnnotations.std, s.std()],
      [sampleAnnotations.cov, s.cov()],
      [sampleAnnotations.kurtosis, s.kurtosis()],
      [sampleAnnotations.range, s.range() as ann.Annotation],
      [sampleAnnotations.min, s.range()[0]],
      [sampleAnnotations.max, s.range()[1]],
      [sampleAnnotations.rme95, s.rme()],
    ]);

    return Status.value(bag);    
  }
});

const conflationAnnotations = {
  /**
   * The heterogeneity of the selected samples in the conflation, between
   * 0 (indistinguishable) to 1 (no similarity)
   */
  heterogeneity: 'duration:conflation:heterogeneity' as typeid,

  /** The number of samples selected for the conflation */
  includedCount: 'duration:conflation:includedCount' as typeid,

  /** The number of samples excluded from the conflation */
  excludedCount: 'duration:conflation:excludedCount' as typeid,
}
