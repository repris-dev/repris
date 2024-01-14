import { json, assignDeep, iterator, uuid, typeid, random, assert, Status } from '@repris/base';

import * as ann from './annotators.js';
import * as wt from './wireTypes.js';
import * as digests from './digests.js';
import { duration, Sample } from './samples.js';

/**
 * A collection of Samples, summarized as a Digest.
 */
export interface AggregatedBenchmark<S extends Sample<any>>
  extends json.Serializable<wt.Benchmark> {
  readonly [typeid]: typeid;

  readonly [uuid]: uuid;

  readonly name: wt.BenchmarkName;

  samples(): IterableIterator<{ sample: S; run: number }>;

  digest(): digests.Digest<S> | undefined;

  annotations(): ReadonlyMap<uuid, wt.AnnotationBag>;

  totalRuns(): number;

  addRun(digest: digests.Digest<S>): DefaultBenchmark;
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

    for (let ws of benchmark.trove) {
      const s = duration.Duration.fromJson(ws.sample);
      if (!Status.isErr(s)) {
        const sample = Status.get(s);
        resultSamples.push({ sample, run: ws.run ?? 0 });
        sampleMap.set(sample[uuid], sample);
      } else {
        return Status.err(
          `Failed to load sample of type: ${ws.sample['@type']}\nReason: ${s[1].message}`,
        );
      }
    }

    let c: digests.duration.Digest | undefined;

    if (benchmark.digest) {
      const cTmp = digests.duration.Digest.fromJson(benchmark.digest, sampleMap);

      if (Status.isErr(cTmp)) {
        return Status.err(`Failed to load digest: ${cTmp[1].message}`);
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
  private _digest?: digests.Digest<duration.Duration>;
  private _annotations = new Map<uuid, wt.AnnotationBag>();
  private _totalruns: number;

  private constructor(
    public readonly name: wt.BenchmarkName,
    samples: Iterable<{ sample: duration.Duration; run: number }>,
    digest?: digests.Digest<duration.Duration>,
    totalRuns = 0,
  ) {
    this._samples = new Map(iterator.map(samples, s => [s.sample, s]));
    this._digest = digest;

    if (this._digest) {
      const index = new Set(iterator.map(this._samples.keys(), s => s[uuid]));
      for (const { sample, status } of this._digest.stat()) {
        if (status !== 'rejected' && !index.has(sample[uuid])) {
          throw new Error(
            `Benchmark failed validation. The benchmark doesn't contain\n` +
              `sample ${sample[uuid]} (status: ${status}) which the digest references.`,
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

  digest(): digests.Digest<duration.Duration> | undefined {
    return this._digest;
  }

  annotations(): Map<uuid, wt.AnnotationBag> {
    return this._annotations;
  }

  addRun(digest: digests.Digest<duration.Duration>): DefaultBenchmark {
    const nextRun = this.totalRuns() + 1;

    // Create a new benchmark, filter rejected samples
    const samples: { sample: duration.Duration; run: number }[] = [];
    for (const { status, sample } of digest.stat()) {
      if (status !== 'rejected') {
        // The run this sample appears in
        const run = this._samples.get(sample)?.run ?? nextRun;
        samples.push({ sample, run });
      }
    }

    const newBench = new DefaultBenchmark(this.name, samples, digest, nextRun);
    newBench._uuid = this[uuid];

    // copy sample annotations
    // Note: the digest annotation isn't copied since
    // a benchmark can only contain one digest at a time.
    const src = this.annotations();
    const dst = newBench.annotations();

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

    return newBench;
  }

  toJson(): wt.Benchmark {
    return {
      '@type': this[typeid],
      '@uuid': this[uuid],
      name: assignDeep({} as wt.BenchmarkName, this.name),
      trove: iterator.collect(
        iterator.map(this.samples(), ({ sample, run }) => ({
          sample: sample.toJson(),
          run,
        })),
      ),
      digest: this.digest()?.toJson(),
      annotations: iterator.reduce(
        this.annotations().entries(),
        (acc, [uuid, bag]) => ((acc[uuid as string] = bag), acc),
        {} as Record<string, wt.AnnotationBag>,
      ),
      totalRuns: this._totalruns,
    };
  }
}

export const annotations = {
  /**
   * A summary of the cache status. Legend:
   *
   *   <mdes> (<total stored>/<total runs>)
   *
   */
  summaryText: 'benchmark:summary-text' as typeid,

  /** Total number of runs stored by the benchmark */
  runs: 'benchmark:runs' as typeid,

  /** Relative minimum detectable effect-size */
  mdes: 'benchmark:mdes' as typeid,

  /** Indicates whether the benchmark is ready to be snapshotted/tested */
  stable: 'benchmark:stable' as typeid,
} as const;

ann.register('@benchmark:annotator' as typeid, {
  annotations() {
    return Object.values(annotations);
  },

  annotate(
    fixt: DefaultBenchmark,
    _request: Map<typeid, {}>,
  ): Status<ann.AnnotationBag | undefined> {
    if (!DefaultBenchmark.is(fixt)) return Status.value(void 0);

    let summary: string;

    const digest = fixt.digest();
    if (digest) {
      let totalIndexed = 0;

      digest.stat().forEach(x => {
        switch (x.status) {
          case 'consistent':
          case 'outlier':
            totalIndexed++;
        }
      });

      // <uncertainty> (<total stored>/<total runs>)
      summary = `${
        totalIndexed > 1 ? digest.mdes().toFixed(2) : '-'
      } (${totalIndexed}/${fixt.totalRuns()})`;
    } else {
      // - (-/<total runs>)
      summary = `- (-/${fixt.totalRuns()})`;
    }

    const result = new Map<typeid, ann.Annotation>([
      [annotations.runs, fixt.totalRuns()],
      [annotations.summaryText, summary],
      [annotations.stable, digest?.ready() ?? false],
    ]);

    if (digest) {
      result.set(annotations.mdes, digest.mdes());
    }

    return Status.value(ann.DefaultBag.from(result));
  },
});
