import { json, Status, iterator } from '@repris/base';

import * as wt from './wireTypes.js';
import { duration } from './samples.js';
import * as f from './benchmark.js';

export const enum BenchmarkState {
  Unknown = 0,
  Stored = 1,
  Tombstoned = 2,
}

type BenchmarkKey = `${string}: ${number}`;

function cacheKey(title: string[], nth: number): BenchmarkKey {
  return `${JSON.stringify(title)}: ${nth}`;
}

export class Snapshot implements json.Serializable<wt.Snapshot> {
  private benchmarks: Map<BenchmarkKey, wt.Benchmark> = new Map();
  private tombstones: Map<BenchmarkKey, wt.BenchmarkName> = new Map();

  constructor() {}

  static fromJson(snap: wt.Snapshot): Snapshot {
    const s = new Snapshot();
    s.indexBenchmarks(snap.benchmarks, snap.tombstones);
    return s;
  }

  isEmpty() {
    return this.benchmarks.size === 0 && this.tombstones.size === 0;
  }

  benchmarkState(title: string[], nth: number) {
    const key = cacheKey(title, nth);
    return this.benchmarks.has(key)
      ? BenchmarkState.Stored
      : this.tombstones.has(key)
      ? BenchmarkState.Tombstoned
      : BenchmarkState.Unknown;
  }

  allBenchmarks(): IterableIterator<f.AggregatedBenchmark<duration.Duration>> {
    return iterator.map(this.benchmarks.values(), f => this.fromJsonBenchmark(f));
  }

  updateBenchmark(benchmark: f.AggregatedBenchmark<duration.Duration>) {
    const { title, nth } = benchmark.name;
    const key = cacheKey(title, nth);

    this.benchmarks.set(key, benchmark.toJson());
  }

  allTombstones(): Iterable<wt.BenchmarkName> {
    return this.tombstones.values();
  }

  /** @returns true if the given title was found in the cache and tombstoned */
  tombstone(title: string[], nth: number): boolean {
    const key = cacheKey(title, nth);
    const benchmark = this.benchmarks.get(key);

    if (benchmark) {
      this.tombstones!.set(key, benchmark.name);
      return true;
    }

    // benchmark not found in the cache
    return false;
  }

  /**
   * @returns The aggregated benchmark for the given title, or an empty benchmark if
   * the name doesn't exist in the snapshot.
   */
  getBenchmark(title: string[], nth: number): f.AggregatedBenchmark<duration.Duration> | undefined {
    const benchmark = this.benchmarks.get(cacheKey(title, nth));
    if (!benchmark) {
      return;
    }

    return this.fromJsonBenchmark(benchmark);
  }

  private fromJsonBenchmark(benchmark: wt.Benchmark): f.AggregatedBenchmark<duration.Duration> {
    const fx = f.DefaultBenchmark.fromJSON(benchmark)
    if (Status.isErr(fx)) {
      throw new Error(Status.get(fx));
    }

    return Status.get(fx);
  }

  private indexBenchmarks(benchmarks: wt.Benchmark[], tombstones: wt.BenchmarkName[] = []) {
    // benchmarks
    for (let i = 0; i < benchmarks.length; i++) {
      const benchmark = benchmarks[i];
      const nth = benchmark.name.nth;

      this.benchmarks.set(cacheKey(benchmark.name.title, nth), benchmark);
    }

    // tombstones
    for (let i = 0; i < tombstones.length; i++) {
      const name = tombstones[i];
      this.tombstones!.set(cacheKey(name.title, name.nth), name);
    }
  }

  toJson(): wt.Snapshot {
    const benchmarks = [] as wt.Benchmark[];

    // dont save samples which were tombstoned
    for (const [key, benchmark] of this.benchmarks.entries()) {
      if (!this.tombstones?.has(key)) {
        benchmarks.push(benchmark);
      }
    }

    return {
      tombstones: Array.from(this.tombstones!.values()),
      benchmarks: benchmarks,
    };
  }
}

/** Join the benchmarks across two snapshots */
export function joinSnapshotBenchmarks(a: Snapshot, b: Snapshot) {
  return iterator.outerJoin(a.allBenchmarks(), b.allBenchmarks(), f =>
    cacheKey(f.name.title, f.name.nth)
  );
}
