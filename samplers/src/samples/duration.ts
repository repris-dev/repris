import {
  Status,
  typeid,
  json,
  timer,
  stats,
  assert,
  Indexable,
  array,
  iterator,
  partitioning,
} from '@sampleci/base';
import * as ann from '../annotators.js';
import * as quantity from '../quantity.js';
import * as wt from '../wireTypes.js';
import * as types from './types.js';

export type SampleOptions = typeof defaultSampleOptions;

export const defaultSampleOptions = {
  maxCapacity: Number.MAX_SAFE_INTEGER,
  significanceThreshold: 0.01,
};

/** Json representation of a duration sample */
type WireType = wt.SampleData & {
  summary: ReturnType<stats.online.Lognormal['toJson']>;
  units: quantity.Units;
  values?: string[];
  maxSize?: number;
};

function isDurationSampleWT(x: unknown): x is WireType {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;

  const obj = x as WireType;
  return (
    obj['@type'] === Duration[typeid] &&
    typeof obj.units === 'string' &&
    (obj.values === void 0 || Array.isArray(obj.values))
  );
}

/** A sample of HrTime durations in nanoseconds */
export class Duration implements types.MutableSample<timer.HrTime> {
  static [typeid] = '@sample:duration' as typeid;
  static is(x: any): x is Duration {
    return x[typeid] === Duration[typeid];
  }

  readonly [typeid] = Duration[typeid];

  private opts: SampleOptions;
  private times: stats.ReservoirSample<timer.HrTime>;
  private onlineStats: stats.online.Lognormal;

  constructor(opts_: Partial<SampleOptions> = {}) {
    this.opts = Object.assign({}, defaultSampleOptions, opts_);
    this.times = new stats.ReservoirSample(this.opts.maxCapacity);
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
      return hsm.variation < this.opts.significanceThreshold;
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
      units: 'microseconds' as quantity.Units,
    };

    if (this.opts.maxCapacity !== void 0) {
      obj.maxSize = this.opts.maxCapacity;
    }

    return obj;
  }

  static fromJson(x: json.Value): Status<Duration> {
    if (!isDurationSampleWT(x)) {
      return Status.err(`Invalid ${Duration[typeid]} sample`);
    }

    const sample = new Duration({ maxCapacity: x.maxSize });
    sample.onlineStats = stats.online.Lognormal.fromJson(x.summary);

    if (Array.isArray(x.values)) {
      x.values.forEach((v) => sample.times.push(timer.fromString(v)));
    }

    return Status.value(sample);
  }
}

export type ConflationOptions = typeof defaultConflationOptions;

export const defaultConflationOptions = {
  /**
   * The minimum similarity (from 0 to 1) for two samples to be considered
   * in the same cluster during conflation
   */
  minSimilarity: 0.9,

  /**
   * The minimum proportion of all samples which must meet the inclusion
   * criteria for the subset to be considered representative
   */
  minSubsetProportion: 0.5,

  /**
   * The maximum number of samples in the conflation
   */
  maxSize: 5,
};

/** A Sample conflation result based on pair-wise Mann-Whitney U tests */
interface MWUConflationAnalysis {
  /**
   * All sample indices ordered by the number of times it is more likely to
   * produce lower values in a sample-by-sample comparison, i.e. fastest to
   * slowest.
   */
  ordered: Int32Array;

  /**
   * Samples excluded from the consistent subset. These will be the slowest
   * samples in the conflation.
   */
  excluded: number[];

  /** Sample indices of samples which are sufficiently similar */
  consistentSubset: number[];
}

export class Conflation implements types.Conflation<timer.HrTime> {
  static [typeid] = '@conflation:duration' as typeid;

  readonly [typeid] = Conflation[typeid];

  private opts: ConflationOptions;
  private allSamples: Duration[] = [];
  private rawSamples: Float64Array[] = [];
  private analysisCache?: MWUConflationAnalysis;

  constructor(initial?: Iterable<Duration>, opts?: Partial<ConflationOptions>) {
    this.opts = Object.assign({}, defaultConflationOptions, opts);
    if (initial !== void 0) {
      for (const x of initial) this.push(x);
    }
  }

  samples(excludeOutliers = true): Duration[] {
    const maxSize = this.opts.maxSize;
    const samples = this.allSamples;

    const a = this.analysis();
    if (!excludeOutliers) {
      return samples.length > maxSize
        ? array.subsetOf(samples, a.ordered.subarray(0, maxSize), [])
        : samples;
    }

    return array.subsetOf(samples, a.consistentSubset, []);
  }

  analysis(): MWUConflationAnalysis {
    return (this.analysisCache ??= Conflation.analyze(this.rawSamples, this.opts));
  }

  push(sample: Duration) {
    this.allSamples.push(sample);
    this.rawSamples.push(sample.toF64Array());
    this.analysisCache = undefined;
  }

  static analyze(samples: Indexable<number>[], opts: ConflationOptions): MWUConflationAnalysis {
    const N = samples.length;

    if (N === 0) {
      return {
        ordered: new Int32Array(0),
        excluded: [],
        consistentSubset: [],
      };
    }

    // Mann-whitney U is not transitive, and so a full ordering of all sample pairs
    // is not possible. Instead we order by the sum of 'win' effect sizes in pair-wise
    // comparisons.
    const wins = new Float32Array(N);
    const edges = [] as [number, number][];

    // Normalized similarities of each edge, between 0 and 1 where 1 is 'equal-chance'
    const similarities = [] as number[];

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const mwu = stats.mwu(samples[i], samples[j]).effectSize - 0.5;
        const similarity = 1 - Math.abs(mwu) * 2;

        if (similarity >= opts.minSimilarity) {
          edges.push([i, j]);
          similarities.push(similarity);
        }

        wins[i] += mwu;
        wins[j] -= mwu;
      }
    }

    // sort all samples
    const orderByWins = new Int32Array(N);
    array.fillAscending(orderByWins, 0);
    orderByWins.sort((a, b) => wins[b] - wins[a]);

    // set of excluded samples
    const excluded = new Set<number>(orderByWins.subarray(opts.maxSize));

    let consistentSubset: number[] = [];

    if (edges.length > 0) {
      // connected components of samples, ignoring excluding samples
      const cc = partitioning.from(
        iterator.filter(edges, ([a, b]) => !excluded.has(a) && !excluded.has(b)),
        N
      );

      if (cc.countGroups() === 1) {
        // take all samples
        consistentSubset = iterator.collect(cc.iterateGroup(0));
      } else {
        // Cohesion of each component
        const groupCohesion = new Float32Array(N);
        edges.forEach(([a, b], i) => {
          if (cc.get(a) === cc.get(b)) groupCohesion[cc.get(a)] += similarities[i];
        });

        // sort samples by:
        //  1. group size (descending)
        //  2. within-group cohesion (descending)
        const groups = iterator.collect(cc.iterateGroups()).sort((a, b) => {
          const deltaSize = cc.groupSize(b) - cc.groupSize(a);
          return deltaSize === 0 ? groupCohesion[b] - groupCohesion[a] : deltaSize;
        });

        // take the largest group.
        consistentSubset = iterator.collect(cc.iterateGroup(groups[0]));
      }
    }

    // check the conflation is large enough
    if (consistentSubset.length < 2) {
      consistentSubset.length = 0;
    }

    return {
      ordered: orderByWins,
      excluded: Array.from(excluded),
      consistentSubset,
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
    sample: types.Sample<unknown>,
    _request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (sample[typeid] !== Duration[typeid]) {
      return Status.value(void 0);
    }

    const d = sample as Duration;
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
  },
});

const conflationAnnotations = {
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
    return Object.values(conflationAnnotations);
  },

  annotate(
    sample: types.Conflation<timer.HrTime>,
    _request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (sample[typeid] !== Conflation[typeid]) {
      return Status.value(void 0);
    }

    const c = sample as Conflation;
    const analysis = c.analysis();

    const summary = Array.from(
      iterator.take(
        analysis.ordered.length,
        iterator.gen(() => '·')
      )
    );

    analysis.excluded.forEach((idx) => (summary[idx] = '×'));
    analysis.consistentSubset.forEach((idx) => (summary[idx] = '*'));

    const bag = ann.DefaultBag.from([[conflationAnnotations.summaryText, summary.join('')]]);

    return Status.value(bag);
  },
});
