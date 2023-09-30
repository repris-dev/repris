import {
  random,
  Status,
  typeid,
  uuid,
} from '@repris/base';
import * as ann from '../annotators.js';
import * as samples from '../samples.js';
import * as wt from '../wireTypes.js';
import { KWConflation, KWConflationResult, KWOptions } from './kruskal.js';
import { ConflationResult, Conflator } from './types.js';

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

  analyze(opts?: Partial<DurationOptions>): Conflation {
    const defaultedOpts = Object.assign({}, defaultDurationOptions, opts);
    this.analysisCache ??= new KWConflation(this.allSamples.map(x => [x.toF64Array(), x]));
    
    const kwAnalysis = this.analysisCache!.conflate(defaultedOpts);
    return new Conflation(defaultedOpts, kwAnalysis);
  }

  push(sample: samples.Duration) {
    this.allSamples.push(sample);
    this.analysisCache = undefined;
  }
}

export class Conflation implements ConflationResult<samples.Duration> {
  static [typeid] = '@conflation:duration' as typeid;

  static is(x?: any): x is Conflation {
    return x !== void 0 && x[typeid] === Conflation[typeid];
  }

  readonly [typeid] = Conflation[typeid];
  readonly [uuid] = random.newUuid();

  constructor(
    private opts: DurationOptions,
    private kwResult: KWConflationResult<samples.Duration>) {
  }

  stat() {
    return this.kwResult.stat;
  }

  effectSize(): number {
    return this.kwResult.effectSize;
  }

  /** A sufficiently large consistent subset was found */
  ready(): boolean {
    return this.kwResult.summary.consistent >= this.opts.minSize;
  }

  toJson(): wt.ConflationResult {
    return {
      '@type': this[typeid],
      '@uuid': this[uuid],
      samples: this.kwResult.stat.map(
        s => ({ '@ref': s.sample[uuid], outlier: s.status !== 'consistent' })
      )
    }
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
    if (!Conflation.is(confl)) return Status.value(void 0);

    let outlier = 0,
      consistent = 0;

    confl.stat().forEach((x) => {
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

    const summary = `${consistent}/${outlier + consistent} (${confl.effectSize().toFixed(2)})`;

    const bag = ann.DefaultBag.from([
      [annotations.summaryText, summary],
      [annotations.isReady, confl.ready()],
    ]);

    return Status.value(bag);
  },
});
