import { random, Status, typeid, uuid } from '@repris/base';
import * as ann from '../annotators.js';
import * as samples from '../samples.js';
import * as wt from '../wireTypes.js';
import { KWConflation, KWConflationResult, KWOptions } from './kruskal.js';
import { ConflatedSampleStatus, ConflationResult, Conflator } from './types.js';

export type DurationOptions = typeof defaultDurationOptions;

const defaultDurationOptions = {
  /** Minimum number of samples in a valid conflation */
  minSize: 4,

  /** The maximum number of samples in the cache */
  maxSize: 7,

  /**
   * Threshold of similarity for the conflation to be considered valid, between
   * 0 (maximum similarity) and 1 (completely dissimilar) inclusive.
   */
  maxEffectSize: 0.075,

  /**
   * Method to remove samples from a cache when more than the maximum
   * number are supplied.
   */
  exclusionMethod: 'outliers' as 'slowest' | 'outliers',
};

export class Duration implements Conflator<samples.Duration, KWOptions> {
  private allSamples: samples.Duration[] = [];
  private analysisCache?: KWConflation<samples.Duration>;

  constructor(initial?: Iterable<samples.Duration>) {
    if (initial !== void 0) {
      for (const x of initial) this.push(x);
    }
  }

  analyze(opts?: Partial<DurationOptions>): DurationResult {
    const defaultedOpts = Object.assign({}, defaultDurationOptions, opts);
    this.analysisCache ??= new KWConflation(this.allSamples.map(x => [x.toF64Array(), x]));

    const kwAnalysis = this.analysisCache!.conflate(defaultedOpts);
    const isReady = kwAnalysis.summary.consistent >= defaultedOpts.minSize;

    return new DurationResult(isReady, kwAnalysis);
  }

  push(sample: samples.Duration) {
    this.allSamples.push(sample);
    this.analysisCache = undefined;
  }
}

export class DurationResult implements ConflationResult<samples.Duration> {
  static [typeid] = '@conflation:duration' as typeid;

  static is(x?: any): x is DurationResult {
    return x !== void 0 && x[typeid] === DurationResult[typeid];
  }

  static fromJson(
    obj: wt.ConflationResult,
    refs: Map<uuid, samples.Duration>
  ): Status<DurationResult> {
    const stat = obj.samples.map(s => ({
      sample: refs.get(s['@ref'])!,
      status: (s.outlier ? 'outlier' : 'consistent') as ConflatedSampleStatus,
    }));

    const result = new DurationResult(obj.isReady, {
      effectSize: obj.effectSize,
      summary: {
        consistent: 0,
        outlier: 0,
        rejected: 0,
      },
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

  constructor(private _isReady: boolean, private _kwResult: KWConflationResult<samples.Duration>) {}

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
    return {
      '@type': this[typeid],
      '@uuid': this[uuid],
      samples: this._kwResult.stat.map(s => ({
        '@ref': s.sample[uuid],
        outlier: s.status !== 'consistent',
      })),
      effectSize: this._kwResult.effectSize,
      isReady: this._isReady,
    };
  }
}

export const annotations = {
  /** The sample conflation is ready to snapshot */
  isReady: 'conflation:ready' as typeid,

  /**
   * A summary of the cache status. Legend:
   *
   *   <consistent subset>/<total samples> (<Kruskal-Wallis effect-size>)
   *
   */
  summaryText: 'duration:conflation:summaryText' as typeid,
} as const;

ann.register('@conflation:duration-annotator' as typeid, {
  annotations() {
    return Object.values(annotations);
  },

  annotate(
    confl: ConflationResult<samples.Duration>,
    _request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (!DurationResult.is(confl)) return Status.value(void 0);

    let outlier = 0,
      consistent = 0;

    confl.stat().forEach(x => {
      switch (x.status) {
        case 'consistent':
          consistent++;
          break;
        case 'outlier':
          outlier++;
          break;
        case 'rejected':
          break;
      }
    });

    // <effect size> (<total samples>)
    const tot = consistent + outlier;
    const summary = `${tot > 1 ? confl.effectSize().toFixed(2) : '-'} (${tot})`;

    const bag = ann.DefaultBag.from([
      [annotations.summaryText, summary],
      [annotations.isReady, confl.ready()],
    ]);

    return Status.value(bag);
  },
});
