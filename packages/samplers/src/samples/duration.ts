import {
  Status,
  typeid,
  json,
  timer,
  stats,
  uuid,
  random,
  array,
  quantity as q,
} from '@repris/base';
import * as ann from '../annotators.js';
import * as wt from '../wireTypes.js';
import type { Sample, MutableSample } from './types.js';

export type Options = {
  /**
   * The maximum size of the collected sample, using reservoir sampling.
   * A value < 0 disables reservoir sampling and the returned sample
   * will contain all observations.
   *
   * See: https://en.wikipedia.org/wiki/Reservoir_sampling
   */
  maxCapacity: number;

  /**
   * If the Average absolute deviation (AAD) about the mode
   * the sample falls below this threshold (as a proportion
   * of the mode), the sample can be considered sufficiently
   * concentrated, and the sample collection cut short.
   */
  shortcutThreshold: number;
};

/** Json representation of a duration sample */
type WireType = wt.Sample & {
  summary: ReturnType<stats.online.Lognormal['toJson']>;
  units: q.UnitsOf<'time'>;
  resolution: number;
  opts: Options;
  values?: number[];
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

const UNIT: q.UnitsOf<'time'> = 'microsecond';

/** A sample of durations in microseconds */
export class Duration implements MutableSample<timer.HrTime, number> {
  static [typeid] = '@sample:duration' as typeid;

  static is(x?: any): x is Duration {
    return x !== void 0 && x[typeid] === Duration[typeid];
  }

  static fromJson(x: json.Value): Status<Duration> {
    if (!isDurationSampleWT(x)) {
      return Status.err(`Invalid ${Duration[typeid]} sample`);
    }

    if (x.units !== UNIT) {
      return Status.err(
        `Sample values are not in expected units. Got ${x.units} but expected ${UNIT}`,
      );
    }

    const sample = new Duration(x.opts ?? {});
    sample.onlineStats = stats.online.Lognormal.fromJson(x.summary);
    sample.uuid = x['@uuid'];
    sample.epsilon = x.resolution;

    if (Array.isArray(x.values)) {
      x.values.forEach(v => sample.times.push(v));
    }

    return Status.value(sample);
  }

  readonly [typeid] = Duration[typeid];

  get [uuid]() {
    return (this.uuid ??= random.newUuid());
  }

  private times: stats.ReservoirSample<number>;
  private onlineStats: stats.online.Lognormal;
  private epsilon = Number.EPSILON;
  private uuid: uuid | undefined;

  constructor(
    private opts: Options,
    rng?: random.Generator,
  ) {
    this.times = new stats.ReservoirSample(opts.maxCapacity, rng);
    this.onlineStats = new stats.online.Lognormal();
  }

  sampleSize(): number {
    return this.times.N();
  }

  observationCount(): number {
    return this.onlineStats.N();
  }

  values(): Iterable<number>;
  values(type: 'f64'): Float64Array | undefined;
  values(type?: 'f64'): Float64Array | Iterable<number> | undefined {
    if (type === 'f64') {
      const dst = new Float64Array(this.times.N());
      array.copyTo(this.times.values, dst);
      return dst;
    }

    return this.times.values as Iterable<number>;
  }

  asQuantity(value: number): q.Quantity {
    return { [q.UnitTag]: UNIT, scalar: value };
  }

  summary(): stats.online.Lognormal {
    return this.onlineStats;
  }

  reset() {
    this.times.reset();
    this.onlineStats.reset();
  }

  push(duration: timer.HrTime) {
    // Convert duration (ns) to microseconds. Note the possibility lose precision
    // for durations > 104 days
    const us = timer.HrTime.toMicroseconds(duration);

    this.times.push(us);
    this.onlineStats.push(us);
  }

  setResolution(resolution: timer.HrTime): void {
    this.epsilon = timer.HrTime.toMicroseconds(resolution);
  }

  resolution(): number {
    return this.epsilon;
  }

  significant(): boolean {
    if (this.sampleSize() >= 3) {
      const sample = this.times.values;
      const hsm = stats.mode.hsm(sample);
      const aad = stats.aad(sample, hsm.mode) / hsm.mode;

      return aad < this.opts.shortcutThreshold;
    }

    return false;
  }

  toJson(): WireType {
    return {
      '@type': Duration[typeid],
      '@uuid': this[uuid],
      summary: this.onlineStats.toJson(),
      units: UNIT,
      resolution: this.epsilon,
      values: this.times.values,
      opts: this.opts,
    };
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
    _request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    if (!Duration.is(sample)) {
      return Status.value(void 0);
    }

    const s = sample.summary();
    const bag = ann.DefaultBag.from([
      [annotations.iter, sample.observationCount()],
      [annotations.k, sample.sampleSize()],
      [annotations.mean, sample.asQuantity(s.mean())],
      [annotations.skew, s.skewness()],
      [annotations.std, s.std()],
      [annotations.cov, s.cov()],
      [annotations.kurtosis, s.kurtosis()],
      [annotations.range, s.range()],
      [annotations.min, s.range()[0]],
      [annotations.max, s.range()[1]],
      [annotations.rme95, s.rme()],
    ]);

    return Status.value(bag);
  },
});
