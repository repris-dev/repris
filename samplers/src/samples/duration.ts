import { Status, typeid, json, timer, stats } from '@sampleci/base';
import * as quantity from '../quantity.js';
import * as wt from '../wireTypes.js';
import * as types from './types.js';

/** Json representation of a duration sample */
type WireType = wt.SampleData & {
  values?: string[], maxSize?: number, units: quantity.Units
};

function isDurationSample(x: unknown): x is WireType {
  if (typeof x === 'object' || x === null || Array.isArray(x)) return false;
  
  const obj = x as WireType;
  return obj['@type'] === Duration[typeid]
      && typeof obj.units === 'string'
      && (obj.values === void 0 || Array.isArray(obj.values));
}

export class Duration implements types.MutableSample<timer.HrTime> {
  private static [typeid] = '@sample:duration' as typeid;

  readonly [typeid] = Duration[typeid];

  private times: stats.ReservoirSample<timer.HrTime>;

  constructor (private maxSize?: number) {
    this.times = new stats.ReservoirSample(
        maxSize === void 0 ? Number.MAX_SAFE_INTEGER : maxSize);
  }

  count() {
    return this.times.count;
  }
  
  values() {
    return this.times.values.values();
  }
  
  reset() {
    this.times.reset();
  }

  push(duration: timer.HrTime) {
    this.times.push(duration);
  }

  toJson() {
    const obj = {
      '@type': Duration[typeid],
      values: this.times.values.map(timer.toString),
      units: 'nanoseconds' as quantity.Units
    } as WireType;

    if (this.maxSize !== void 0) {
      obj.maxSize = this.maxSize;
    }

    return obj;
  }

  static fromJson(x: json.Value): Status<Duration> {
    if (!isDurationSample(x)) { return invalidSample; }

    const sample = new Duration(x.maxSize);

    if (Array.isArray(x.values)) {
      x.values.forEach(v => sample.push(timer.fromString(v)));
    }

    return Status.value(sample);
  }
}

const invalidSample = Status.err(`Invalid ${ Duration[typeid] } sample`);
