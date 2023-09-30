import { random, Status, typeid, uuid, quantity as q, assert, iterator } from '@repris/base';
import { duration } from '../samples.js';
import * as wt from '../wireTypes.js';
import * as types from './types.js';
import { KWConflation, KWConflationResult } from './kruskal.js';

export type Options = {
  /** Minimum number of samples in a valid conflation */
  minSize: number,
  /** The maximum number of samples in the cache */
  maxSize: number,
  /**
   * Threshold of similarity for the conflation to be considered valid, between
   * 0 (maximum similarity) and 1 (completely dissimilar) inclusive.
   */
  maxEffectSize: number,
  /**
   * Method to remove samples from a cache when more than the maximum
   * number are supplied.
   */
  exclusionMethod: 'slowest' | 'outliers',
}

export function conflate(samples: Iterable<duration.Duration>, opts: Options): Result {
  const kw = new KWConflation(iterator.collect(iterator.map(samples, x => [x.toF64Array(), x])));

  const kwAnalysis = kw.conflate(opts);
  const summary = summarize(kwAnalysis.stat);
  const isReady = summary.consistent >= opts.minSize;

  return new Result(isReady, kwAnalysis);
}

export class Result implements types.Conflation<duration.Duration> {
  static [typeid] = '@conflation:duration' as typeid;

  static is(x?: any): x is Result {
    return x !== void 0 && x[typeid] === Result[typeid];
  }

  static fromJson(
    obj: wt.Conflation,
    refs: Map<uuid, duration.Duration>
  ): Status<Result> {
    let stat = [];

    for (const s of obj.samples) {
      const ref = s['@ref'];

      if (!refs.has(ref)) {
        return Status.err(`Unresolved reference to sample: "${ref}"`);
      }

      stat.push({
        sample: refs.get(ref)!,
        status: (s.outlier ? 'outlier' : 'consistent') as types.ConflatedSampleStatus,
      });
    }

    const result = new Result(obj.isReady, {
      effectSize: obj.effectSize,
      stat,
    });

    result._uuid = obj['@uuid'];

    return Status.value(result);
  }

  readonly [typeid] = Result[typeid];
  private _uuid!: uuid;

  get [uuid]() {
    if (!this._uuid) {
      this._uuid = random.newUuid();
    }
    return this._uuid;
  }

  constructor(private _isReady: boolean, private _kwResult: KWConflationResult<duration.Duration>) {}

  stat() {
    return this._kwResult.stat;
  }

  effectSize(): number {
    return this._kwResult.effectSize;
  }

  /** A sufficiently large consistent subset was found */
  ready(): boolean {
    return this._isReady;
  }

  values(): Iterable<any> {
    throw 'not impl';
  }

  /** Convert a sample value as a quantity */
  asQuantity(value: number): q.Quantity {
    assert.gt(this._kwResult.stat.length, 0);
    return this._kwResult.stat[0].sample.asQuantity(value);
  }

  toJson(): wt.Conflation {
    const samples = this._kwResult.stat
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
      effectSize: this._kwResult.effectSize,
      isReady: this._isReady,
    };
  }
}

function summarize(stat: { sample: any; status: types.ConflatedSampleStatus }[]) {
  const result: Record<types.ConflatedSampleStatus, number> = {
    consistent: 0,
    outlier: 0,
    rejected: 0,
  };

  for (const s of stat) result[s.status]++;
  return result;
}
