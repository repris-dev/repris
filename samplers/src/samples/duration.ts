import {
  Status,
  typeid,
  json,
  timer,
  stats,
  assert,
} from '@repris/base';
import * as ann from '../annotators.js';
import * as quantity from '../quantity.js';
import * as wt from '../wireTypes.js';
import { Sample, MutableSample } from './types.js';

export type DurationOptions = typeof defaultDurationOptions;

export const defaultDurationOptions = {
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
export class Duration implements MutableSample<timer.HrTime> {
  static [typeid] = '@sample:duration' as typeid;
  static is(x?: any): x is Duration {
    return x !== void 0 && x[typeid] === Duration[typeid];
  }

  readonly [typeid] = Duration[typeid];

  private opts: DurationOptions;
  private times: stats.ReservoirSample<timer.HrTime>;
  private onlineStats: stats.online.Lognormal;

  constructor(opts_: Partial<DurationOptions> = {}) {
    this.opts = Object.assign({}, defaultDurationOptions, opts_);
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

const annotations = {
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
    return Object.values(annotations);
  },

  annotate(
    sample: Sample<unknown>,
    _request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (!Duration.is(sample)) {
      return Status.value(void 0);
    }

    const s = sample.summary();
    const bag = ann.DefaultBag.from([
      [annotations.iter, sample.observationCount()],
      [annotations.k, sample.sampleSize()],
      [annotations.mean, s.mean()],
      [annotations.skew, s.skewness()],
      [annotations.std, s.std()],
      [annotations.cov, s.cov()],
      [annotations.kurtosis, s.kurtosis()],
      [annotations.range, s.range() as ann.Annotation],
      [annotations.min, s.range()[0]],
      [annotations.max, s.range()[1]],
      [annotations.rme95, s.rme()],
    ]);

    return Status.value(bag);
  },
});
