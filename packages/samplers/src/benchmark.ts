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
  extends json.Serializable<wt.Benchmark> {
  /** The kind of conflation result */
  readonly [typeid]: typeid;

  readonly [uuid]: uuid;

  readonly name: wt.BenchmarkName;

  samples(): IterableIterator<{ sample: S; run: number }>;

  conflation(): conflations.Conflation<S> | undefined;

  annotations(): ReadonlyMap<uuid, wt.AnnotationBag>;

  totalRuns(): number;

  addRun(conflation: conflations.Conflation<S>): DefaultBenchmark;
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

    const resultSamples = [] as { sample: duration.Duration; run: number }[];
    const sampleMap = new Map<uuid, duration.Duration>();

    for (let ws of benchmark.samples) {
      const s = duration.Duration.fromJson(ws.data);
      if (!Status.isErr(s)) {
        const sample = Status.get(s);
        resultSamples.push({ sample, run: (ws as any).run ?? 0 });
        sampleMap.set(sample[uuid], sample);
      } else {
        return Status.err(
          `Failed to load sample of type: ${ws.data['@type']}\nReason: ${s[1].message}`
        );
      }
    }

    let c: conflations.duration.Result | undefined;

    if (benchmark.conflation) {
      const cTmp = conflations.duration.Result.fromJson(benchmark.conflation, sampleMap);

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

  /** Create a benchmark without any samples */
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
  private _samples: Map<duration.Duration, { sample: duration.Duration; run: number }>;
  private _conflation?: conflations.Conflation<duration.Duration>;
  private _annotations = new Map<uuid, wt.AnnotationBag>();
  private _totalruns: number;

  private constructor(
    public readonly name: wt.BenchmarkName,
    samples: Iterable<{ sample: duration.Duration; run: number }>,
    conflation?: conflations.Conflation<duration.Duration>,
    totalRuns = 0
  ) {
    this._samples = new Map(iterator.map(samples, s => [s.sample, s]));
    this._conflation = conflation;

    if (this._conflation) {
      const index = new Set(iterator.map(this._samples.keys(), s => s[uuid]));
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

  samples(): IterableIterator<{ sample: duration.Duration; run: number }> {
    return this._samples.values();
  }

  conflation(): conflations.Conflation<duration.Duration> | undefined {
    return this._conflation;
  }

  annotations(): Map<uuid, wt.AnnotationBag> {
    return this._annotations;
  }

  addRun(conflation: conflations.Conflation<duration.Duration>): DefaultBenchmark {
    const nextRun = this.totalRuns() + 1;

    // Create a new benchmark
    const samples: { sample: duration.Duration; run: number }[] = [];
    for (const { status, sample } of conflation.stat()) {
      if (status !== 'rejected') {
        const run = this._samples.get(sample)?.run ?? nextRun;
        samples.push({ sample, run });
      }
    }

    const newFixt = new DefaultBenchmark(this.name, samples, conflation, nextRun);
    newFixt._uuid = this[uuid];

    // copy sample annotations
    // Note: the conflation annotation isn't copied since
    // a benchmark can only contain one conflation at a time.
    const src = this.annotations();
    const dst = newFixt.annotations();

    for (const { sample } of samples) {
      const sId = sample[uuid];
      if (src.has(sId)) {
        dst.set(sId, src.get(sId)!);
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
        iterator.map(this.samples(), ({ sample, run }) => ({
          data: sample.toJson(),
          run,
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
  summaryText: 'benchmark:summary-text' as typeid,

  nRuns: 'benchmark:runs' as typeid,

  uncertainty: 'benchmark:uncertainty' as typeid,

  stable: 'benchmark:stable' as typeid,
} as const;

ann.register('@benchmark:annotator' as typeid, {
  annotations() {
    return Object.values(annotations);
  },

  annotate(
    fixt: DefaultBenchmark,
    _request: Map<typeid, {}>
  ): Status<ann.AnnotationBag | undefined> {
    if (!DefaultBenchmark.is(fixt)) return Status.value(void 0);

    let summary: string;

    const confl = fixt.conflation();
    if (confl) {
      let totalIndexed = 0;

      confl.stat().forEach(x => {
        switch (x.status) {
          case 'consistent':
          case 'outlier':
            totalIndexed++;
        }
      });

      // <uncertainty> (<total stored>/<total runs>)
      summary = `${
        totalIndexed > 1 ? confl.uncertainty().toFixed(2) : '-'
      } (${totalIndexed}/${fixt.totalRuns()})`;
    } else {
      // - (-/<total runs>)
      summary = `- (-/${fixt.totalRuns()})`;
    }

    const result = new Map<typeid, ann.Annotation>([
      [annotations.nRuns, fixt.totalRuns()],
      [annotations.summaryText, summary],
      [annotations.stable, confl?.ready() ?? false],
    ]);

    if (confl) {
      result.set(annotations.uncertainty, confl.uncertainty());
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});
