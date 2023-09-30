import { random, Status, typeid, uuid, quantity as q, assert } from '@repris/base';
import { duration } from '../samples.js';
import * as wt from '../wireTypes.js';
import { KWConflation, KWConflationResult, KWOptions } from './kruskal.js';
import { ConflatedSampleStatus, ConflationResult, Conflator } from './types.js';

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

export class Duration implements Conflator<duration.Duration, KWOptions> {
  private allSamples: duration.Duration[] = [];
  private analysisCache?: KWConflation<duration.Duration>;

  constructor(initial?: Iterable<duration.Duration>) {
    if (initial !== void 0) {
      for (const x of initial) this.push(x);
    }
  }

  analyze(opts: Options): DurationResult {
    this.analysisCache ??= new KWConflation(this.allSamples.map(x => [x.toF64Array(), x]));

    const kwAnalysis = this.analysisCache!.conflate(opts);
    const summary = summarize(kwAnalysis.stat);
    const isReady = summary.consistent >= opts.minSize;

    return new DurationResult(isReady, kwAnalysis);
  }

  push(sample: duration.Duration) {
    this.allSamples.push(sample);
    this.analysisCache = undefined;
  }
}

export class DurationResult implements ConflationResult<duration.Duration> {
  static [typeid] = '@conflation:duration' as typeid;

  static is(x?: any): x is DurationResult {
    return x !== void 0 && x[typeid] === DurationResult[typeid];
  }

  static fromJson(
    obj: wt.ConflationResult,
    refs: Map<uuid, duration.Duration>
  ): Status<DurationResult> {
    let stat = [];

    for (const s of obj.samples) {
      const ref = s['@ref'];

      if (!refs.has(ref)) {
        return Status.err(`Unresolved reference to sample: "${ref}"`);
      }

      stat.push({
        sample: refs.get(ref)!,
        status: (s.outlier ? 'outlier' : 'consistent') as ConflatedSampleStatus,
      });
    }

    const result = new DurationResult(obj.isReady, {
      effectSize: obj.effectSize,
      stat,
    });

    result._uuid = obj['@uuid'];

    return Status.value(result);
  }

  readonly [typeid] = DurationResult[typeid];
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

  toJson(): wt.ConflationResult {
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

function summarize(stat: { sample: any; status: ConflatedSampleStatus }[]) {
  const result: Record<ConflatedSampleStatus, number> = {
    consistent: 0,
    outlier: 0,
    rejected: 0,
  };

  for (const s of stat) result[s.status]++;
  return result;
}
