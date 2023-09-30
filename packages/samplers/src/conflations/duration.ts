import { random, Status, typeid, uuid, quantity as q, assert, quantity } from '@repris/base';
import { duration } from '../samples.js';
import * as wt from '../wireTypes.js';
import * as types from './types.js';
import { KWConflation, KWConflationResult } from './kruskal.js';
import { annotators } from '../index.js';

export type Options = {
  /** Minimum number of samples in a valid conflation */
  minSize: number,
  /** The maximum number of samples in the cache */
  maxSize: number,
  /**
   * Threshold of similarity for the conflation to be considered valid, between
   * 0 (maximum similarity) and 1 (completely dissimilar) inclusive.
   */
  maxUncertainty: number,
  /** The location estimation to use for each samples */
  locationEstimationType: typeid
}

type DurationWT = wt.Conflation & {
  statistic: number[]
}

export function conflate(
  samples: Iterable<[duration.Duration, wt.AnnotationBag | undefined]>,
  opts: Options,
): Status<Result> {
  const points = [] as [number, duration.Duration][];
  for (const [sample, bag] of samples) {
    if (bag !== void 0 && bag[opts.locationEstimationType]) {
      const anno = annotators.fromJson(bag[opts.locationEstimationType]);
      const val = quantity.isQuantity(anno) ? anno.scalar : Number(anno);
      points.push([Number(val), sample]);
    } else {
      // todo: annotate the sample
      return Status.err(`Sample could not be conflated. Point estimate '${ opts.locationEstimationType }' is missing` );
    }
  }
  
  const kw = new KWConflation(points);
  const kwAnalysis = kw.conflate(opts);
  const summary = summarize(kwAnalysis.stat);
  const isReady = summary.consistent >= opts.minSize;

  return Status.value(new Result(isReady, kwAnalysis));
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
    if (obj['@type'] !== Result[typeid]) {
      return Status.err('Not a valid conflation type');
    }

    const wt = obj as DurationWT;

    let stat = [];
    for (const s of wt.samples) {
      const ref = s['@ref'];

      if (!refs.has(ref)) {
        return Status.err(`Unresolved reference to sample: "${ref}"`);
      }

      stat.push({
        sample: refs.get(ref)!,
        status: (s.outlier ? 'outlier' : 'consistent') as types.ConflatedSampleStatus,
      });
    }

    const result = new Result(wt.isReady, {
      relativeSpread: wt.uncertainty,
      samplingDistribution: wt.statistic,
      stat,
    });

    result._uuid = wt['@uuid'];

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

  constructor(
    private _isReady: boolean,
    private _kwResult: KWConflationResult<duration.Duration>)
  {
  }

  stat() {
    return this._kwResult.stat;
  }

  uncertainty(): number {
    return this._kwResult.relativeSpread;
  }

  ready(): boolean {
    return this._isReady;
  }

  /** Convert a sample value as a quantity */
  asQuantity(value: number): q.Quantity {
    // just use the first sample to convert a value
    assert.gt(this._kwResult.stat.length, 0);
    return this._kwResult.stat[0].sample.asQuantity(value);
  }

  samplingDistribution(): number[] {
    return this._kwResult.samplingDistribution;
  }

  toJson(): DurationWT {
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
      uncertainty: this._kwResult.relativeSpread,
      statistic: this._kwResult.samplingDistribution,
      isReady: this._isReady,
    };
  }
}

function summarize(stat: { status: types.ConflatedSampleStatus }[]) {
  const result: Record<types.ConflatedSampleStatus, number> = {
    consistent: 0,
    outlier: 0,
    rejected: 0,
  };

  for (const s of stat) result[s.status]++;
  return result;
}
