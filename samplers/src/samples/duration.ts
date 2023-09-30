import { Status, typeid, json, timer, stats } from '@sampleci/base';
import * as ann from '../annotators.js';
import * as quantity from '../quantity.js';
import * as wt from '../wireTypes.js';
import * as types from './types.js';
import { Sample } from './types.js';

/** Json representation of a duration sample */
type WireType = wt.SampleData & {
  summary: ReturnType<stats.OnlineStats['toJson']>,
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

/**
 * A sample of HrTime durations in nanoseconds
 */
export class Duration implements types.MutableSample<timer.HrTime> {
  static [typeid] = '@sample:duration' as typeid;

  readonly [typeid] = Duration[typeid];

  private times: stats.ReservoirSample<timer.HrTime>;

  // TODO: stats specifically for bigint
  private onlineStats: stats.LognormalOnlineStats;

  constructor (private maxCapacity?: number) {
    this.times = new stats.ReservoirSample(
      maxCapacity === void 0 ? Number.MAX_SAFE_INTEGER : maxCapacity
    );

    this.onlineStats = new stats.LognormalOnlineStats();
  }

  count() {
    return this.times.count;
  }
  
  values() {
    return this.times.values.values();
  }

  summary(): stats.LognormalOnlineStats {
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
    return this.onlineStats.kurtosis() >= 0 && this.onlineStats.rme(1) < 5;

//    const vals = this.times.values;
//    const n = vals.length;
//
//    if (n < 3) { return false; }
//
//    const mode = this.onlineStats.mode();
//
//    let k = 0;
//    for (let i = 0; i < n; i++) {
//      if (Math.abs(Number(vals[i]) - mode) / mode < .25) { k++; };
//    }
//    
//    console.info(mode, k, n);
//    k /= (n - 1);
//
//    return k > .5;
  }

  toF64Array() {
    const buff = new Float64Array(this.times.count);

    let idx = 0;
    for (const t of this.times.values) {
      buff[idx++] = Number(t);
    }

    return buff;
  }

  toJson() {
    const obj = {
      '@type': Duration[typeid],
      summary: this.onlineStats.toJson(),
      values: this.times.values.map(timer.toString),
      units: 'microseconds' as quantity.Units
    } as WireType;

    if (this.maxCapacity !== void 0) {
      obj.maxSize = this.maxCapacity;
    }

    return obj;
  }

  static fromJson(x: json.Value): Status<Duration> {
    if (!isDurationSampleWT(x)) { return invalidSample; }

    const sample = new Duration(x.maxSize);
    sample.onlineStats = stats.LognormalOnlineStats.fromJson(x.summary);

    if (Array.isArray(x.values)) {
      x.values.forEach(v => sample.times.push(timer.fromString(v)));
    }

    return Status.value(sample);
  }
}

const invalidSample = Status.err(`Invalid ${ Duration[typeid] } sample`);

const Annotations = {
  /** Number of observations seen during sampling */
  n: 'duration:n' as typeid,

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

const annotator = {
  name: '@sample:duration-annotator',

  annotations() {
    return Object.values(Annotations);
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

    const annotations = new Map([
      [Annotations.n, s.N()],
      [Annotations.k, d.count()],
      [Annotations.mean, s.mean()],
      [Annotations.skew, s.skewness()],
      [Annotations.std, s.std()],
      [Annotations.cov, s.cov()],
      [Annotations.kurtosis, s.kurtosis()],
      [Annotations.range, s.range() as ann.Annotation],
      [Annotations.min, s.range()[0]],
      [Annotations.max, s.range()[1]],
      [Annotations.rme95, s.rme()],
    ]);

    return Status.value({ annotations, name: annotator.name });    
  }
}

ann.register(annotator.name, annotator);
