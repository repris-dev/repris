import { Status, typeid, json, timer, stats } from '@sampleci/base';
import * as quantity from '../quantity.js';
import * as wt from '../wireTypes.js';
import * as types from './types.js';

/** Json representation of a duration sample */
type WireType = wt.SampleData & {
  summary: ReturnType<stats.OnlineStats['toJson']>,
  units: quantity.Units,
  values?: string[],
  maxSize?: number,
};

function isDurationSample(x: unknown): x is WireType {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;

  const obj = x as WireType;
  return obj['@type'] === Duration[typeid]
      && typeof obj.units === 'string'
      && (obj.values === void 0 || Array.isArray(obj.values));
}

export class Duration implements types.MutableSample<timer.HrTime> {
  static [typeid] = '@sample:duration' as typeid;

  readonly [typeid] = Duration[typeid];

  private times: stats.ReservoirSample<timer.HrTime>;

  // Todo: stats specifically for bigint
  private onlineStats: stats.OnlineStats;

  constructor (private maxSize?: number) {
    this.times = new stats.ReservoirSample(
        maxSize === void 0 ? Number.MAX_SAFE_INTEGER : maxSize);

    this.onlineStats = new stats.OnlineStats();
  }

  count() {
    return this.onlineStats.N();
  }
  
  values() {
    return this.times.values.values();
  }

  summary(): stats.SimpleSummary<number> {
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

  toJson() {
    const obj = {
      '@type': Duration[typeid],
      summary: this.onlineStats.toJson(),
      values: this.times.values.map(timer.toString),
      units: 'microseconds' as quantity.Units
    } as WireType;

    if (this.maxSize !== void 0) {
      obj.maxSize = this.maxSize;
    }

    return obj;
  }

  static fromJson(x: json.Value): Status<Duration> {
    if (!isDurationSample(x)) { return invalidSample; }

    const sample = new Duration(x.maxSize);

    sample.onlineStats = stats.OnlineStats.fromJson(x.summary);

    if (Array.isArray(x.values)) {
      x.values.forEach(v => sample.times.push(timer.fromString(v)));
    }

    return Status.value(sample);
  }
}

const invalidSample = Status.err(`Invalid ${ Duration[typeid] } sample`);
