import { json, assignDeep, iterator, uuid, typeid, random, assert, Status } from '@repris/base';

import * as ann from './annotators.js';
import * as wt from './wireTypes.js';
import * as conflations from './conflations.js';
import { duration, Sample } from './samples.js';

/**
 * A test run produces a report. The report contains a number of benchmarks,
 * and each benchmark contains a sample and its annotations.
 *
 * When multiple reports are combined together it produces a set of aggregated
 * benchmarks which can be summarized by a conflation.
 */
export interface AggregatedBenchmark<S extends Sample<any>>
  extends json.Serializable<wt.Benchmark>
{
  /** The kind of conflation result */
  readonly [typeid]: typeid;

  readonly [uuid]: uuid;

  readonly name: wt.BenchmarkName;

  samples(): Iterable<S>;

  conflation(): conflations.ConflationResult<S> | undefined;

  annotations(): ReadonlyMap<uuid, wt.AnnotationBag>;

  totalRuns(): number;

  addRun(conflation: conflations.ConflationResult<S>): DefaultBenchmark;
}

export class DefaultBenchmark implements AggregatedBenchmark<duration.Duration> {
  static readonly [typeid] = '@benchmark:duration' as typeid;

  static is(x?: any): x is DefaultBenchmark {
    return x !== void 0 && x[typeid] === DefaultBenchmark[typeid];
  }

  static fromJSON(benchmark: wt.Benchmark): Status<DefaultBenchmark> {
    if (benchmark['@type'] !== DefaultBenchmark[typeid]) {
      return Status.err(`Unexpected type`);
    }

    const resultSamples = [] as duration.Duration[];
    const sampleMap = new Map<uuid, duration.Duration>();

    for (let ws of benchmark.samples) {
      const s = duration.Duration.fromJson(ws.data);
      if (!Status.isErr(s)) {
        const sample = Status.get(s);
        resultSamples.push(sample);
        sampleMap.set(sample[uuid], sample);
      } else {
        return Status.err(
          `Failed to load sample of type: ${ws.data['@type']}\nReason: ${s[1].message}`
        );
      }
    }

    let c: conflations.duration.DurationResult | undefined;

    if (benchmark.conflation) {
      const cTmp = conflations.duration.DurationResult.fromJson(benchmark.conflation, sampleMap);

      if (Status.isErr(cTmp)) {
        return Status.err(`Failed to load conflation: ${cTmp[1].message}`);
      }

      c = cTmp[0];
    }

    const result = new DefaultBenchmark(benchmark.name, resultSamples, c, benchmark.totalRuns);
    const annotations = result.annotations();

    for (const [key, bag] of Object.entries(benchmark.annotations ?? {})) {
      annotations.set(key as uuid, bag);
    }

    result._uuid = benchmark['@uuid'];

    return Status.value(result);
  }

  static empty(name: wt.BenchmarkName): DefaultBenchmark {
    return new DefaultBenchmark(name, []);
  }

  readonly [typeid] = DefaultBenchmark[typeid];

  get [uuid]() {
    if (!this._uuid) {
      this._uuid = random.newUuid();
    }
    return this._uuid;
  }

  private _uuid!: uuid;
  private _samples: duration.Duration[];
  private _conflation?: conflations.ConflationResult<duration.Duration>;
  private _annotations = new Map<uuid, wt.AnnotationBag>();
  private _totalruns: number;

  private constructor(
    public readonly name: wt.BenchmarkName,
    samples: Iterable<duration.Duration>,
    conflation?: conflations.ConflationResult<duration.Duration>,
    totalRuns = 0
  ) {
    this._samples = iterator.collect(samples[Symbol.iterator]());
    this._conflation = conflation;

    if (this._conflation) {
      const index = new Set(iterator.map(this._samples, s => s[uuid]));
      for (const { sample, status } of this._conflation.stat()) {
        if (status !== 'rejected' && !index.has(sample[uuid])) {
          throw new Error(
            `Benchmark failed validation. The benchmark doesn't contain\n` +
              `sample ${sample[uuid]} (status: ${status}) which the conflation references.`
          );
        }
      }
    }

    assert.gte(totalRuns, 0);
    this._totalruns = totalRuns;
  }

  totalRuns(): number {
    return this._totalruns;
  }

  samples(): Iterable<duration.Duration> {
    return this._samples;
  }

  conflation(): conflations.ConflationResult<duration.Duration> | undefined {
    return this._conflation;
  }

  annotations(): Map<uuid, wt.AnnotationBag> {
    return this._annotations;
  }

  addRun(conflation: conflations.ConflationResult<duration.Duration>): DefaultBenchmark {
    // Create a new benchmark
    const samples: duration.Duration[] = [];
    for (const { status, sample } of conflation.stat()) {
      if (status !== 'rejected') {
        samples.push(sample);
      }
    }

    const newFixt = new DefaultBenchmark(this.name, samples, conflation, this.totalRuns() + 1);
    newFixt._uuid = this[uuid];

    // copy sample annotations
    // Note: the conflation annotation isn't copied since
    // a benchmark can only contain one conflation at a time.
    const src = this.annotations();
    const dst = newFixt.annotations();

    for (const s of samples) {
      if (src.has(s[uuid])) {
        dst.set(s[uuid], src.get(s[uuid])!);
      }
    }

    // copy the self-annotation of this benchmark (if one exists)
    if (src.has(this[uuid])) {
      dst.set(this[uuid], src.get(this[uuid])!);
    }

    return newFixt;
  }

  toJson(): wt.Benchmark {
    return {
      '@type': this[typeid],
      '@uuid': this[uuid],
      name: assignDeep({} as wt.BenchmarkName, this.name),
      samples: iterator.collect(
        iterator.map(this.samples(), sample => ({
          data: sample.toJson(),
        }))
      ),
      conflation: this.conflation()?.toJson(),
      annotations: iterator.reduce(
        this.annotations().entries(),
        (acc, [uuid, bag]) => ((acc[uuid as string] = bag), acc),
        {} as Record<string, wt.AnnotationBag>
      ),
      totalRuns: this._totalruns,
    };
  }
}

export const annotations = {
  /**
   * A summary of the cache status. Legend:
   *
   *   <active subset>/<total samples> (<Kruskal-Wallis effect-size>)
   *
   */
  summaryText: 'benchmark:summaryText' as typeid,

  stable: 'benchmark:stable' as typeid,
} as const;

ann.register('@benchmark:annotator' as typeid, {
  annotations() {
    return Object.values(annotations);
  },

  annotate(fixt: DefaultBenchmark, _request: Map<typeid, {}>): Status<ann.AnnotationBag | undefined> {
    if (!DefaultBenchmark.is(fixt)) return Status.value(void 0);

    let summary;

    const confl = fixt.conflation();
    if (confl) {
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
        }
      });

      // <effect size> (<active samples>/<total runs>)
      const tot = consistent + outlier;
      summary = `${tot > 1 ? confl.effectSize().toFixed(2) : '-'} (${tot}/${fixt.totalRuns()})`;
    } else {
      // - (-/<total runs>)
      summary = `- (-/${fixt.totalRuns()})`;
    }

    const bag = ann.DefaultBag.from([
      [annotations.summaryText, summary],
      [annotations.stable, confl?.ready() ?? false],
    ]);

    return Status.value(bag);
  },
});
