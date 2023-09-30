import { debug } from 'util';
import * as crypto from 'crypto';

import circus from 'jest-circus/runner';
import type { JestEnvironment } from '@jest/environment';
import type { Circus, Config } from '@jest/types';
import type { AssertionResult, TestFileEvent, TestResult } from '@jest/test-result';

import {
  annotators,
  samples,
  conflations,
  wiretypes as wt,
  snapshots,
  snapshotManager,
  benchmark as f,
} from '@repris/samplers';
import { typeid, assert, iterator as iter, Status, uuid, asTuple } from '@repris/base';

import * as reprisConfig from './config.js';
import { BaselineResolver, IndexResolver } from './snapshotUtils.js';

export interface AugmentedAssertionResult extends AssertionResult {
  repris?: {
    /** Sample annotations for this benchmark */
    sample?: wt.AnnotationBag;
    /** Conflation annotations for this benchmark */
    conflation?: wt.AnnotationBag;
    /** benchmark annotations */
    benchmark?: wt.AnnotationBag;
  };
}

export interface AugmentedTestResult extends TestResult {
  repris?: {
    cacheStat: {
      /** Count of benchmarks run which produced at least one sample */
      runBenchmarks: number;
      /** Count of benchmarks skipped in this test run */
      skippedBenchmarks: number;
      /** Count of new benchmarks seen in this test run */
      newBenchmarks: number;
      /** Count of all benchmarks in the cache after the test run */
      totalBenchmarks: number;
      /**
       * Count of benchmarks which are ready for snapshotting after
       * the test run. This is only positive when shapshots are not being
       * updated.
       */
      stagedBenchmarks: number;
    };
    snapshotStat: {
      /** Count of benchmarks moved to snapshots in the current test run */
      updated: number;
      /**
       * Count of benchmarks moved to snapshots in the current epoch (i.e.
       * over all runs)
       */
      updatedTotal: number;
    };
    epochStat: {
      /**
       * True if the snapshots are being updated and all benchmarks have
       * been committed to their snapshots.
       */
      complete: boolean;
    };
  };
}

const dbg = debug('repris:runner');

function initializeEnvironment(
  environment: JestEnvironment,
  cfg: reprisConfig.ReprisConfig,
  getState: (title: string[], nth: number) => snapshots.BenchmarkState
) {
  const samples: { title: string[]; nth: number; sample: samples.Sample<unknown> }[] = [];
  const newSamples: { title: string[]; nth: number; sample: samples.Sample<unknown> }[] = [];
  const titleCount = new RecordCounter<string>();
  const stat = {
    runBenchmarks: 0,
    skippedBenchmarks: 0,
    newBenchmarks: 0,
  };

  let title: string[] | undefined;
  let nth = -1;

  environment.global.crypto ??= globalThis.crypto ??= {
    randomUUID() {
      return crypto.randomUUID() as any;
    },
  } as any;

  environment.global.getSampleOptions = () => cfg.sample.options;
  environment.global.getSamplerOptions = () => cfg.sampler.options;
  environment.global.onSample = (_matcherState: any, sample: samples.Sample<unknown>) => {
    assert.isDefined(title, 'No test running');

    if (newSamples.length === 0) {
      stat.runBenchmarks++;

      if (getState(title, nth) === snapshots.BenchmarkState.Unknown) {
        stat.newBenchmarks++;
      }
    }

    newSamples.push({ title, nth, sample });
  };

  const hte = environment.handleTestEvent;
  environment.handleTestEvent = (evt, state) => {
    if (evt.name === 'test_start') {
      newSamples.length = 0;
      title = getTestID(evt.test);
      nth = titleCount.increment(JSON.stringify(title));

      const state = getState(title, nth);
      if (state === snapshots.BenchmarkState.Tombstoned) {
        evt.test.mode = 'skip';
        stat.skippedBenchmarks++;
      }
    } else if (evt.name === 'test_done') {
      if (!evt.test.failing) {
        for (const s of newSamples) samples.push(s);
      }
    }

    return hte?.(evt as Circus.SyncEvent, state);
  };

  return {
    stat() {
      return stat;
    },
    getSamples() {
      return samples;
    },
  };
}

export default async function testRunner(
  globalConfig: Config.GlobalConfig,
  config: Config.ProjectConfig,
  environment: JestEnvironment,
  runtime: typeof import('jest-runtime'),
  testPath: string,
  sendMessageToJest?: TestFileEvent
): Promise<TestResult> {
  const reprisCfg = await reprisConfig.load(globalConfig.rootDir);
  const stagingAreaMgr = new snapshotManager.SnapshotFileManager(IndexResolver(config));

  // index for this test
  let indexedSnapshot: snapshots.Snapshot | undefined;

  if (config.cache) {
    const sCacheFile = await stagingAreaMgr.loadOrCreate(testPath);

    if (Status.isErr(sCacheFile)) {
      throw new Error(`Failed to load staging area for test file:\n${sCacheFile[1]}`);
    }

    indexedSnapshot = sCacheFile[0];
  }

  // Don't re-run benchmarks which were committed to the snapshot in a previous run
  const skipTest = (title: string[], nth: number) =>
    indexedSnapshot?.benchmarkState(title, nth) ?? snapshots.BenchmarkState.Unknown;

  // Sample annotation config
  const sampleAnnotations = reprisConfig.parseAnnotations(reprisCfg.sample.annotations)();
  // Conflation annotation config
  const conflationAnnotationConfig = reprisConfig.parseAnnotations(
    reprisCfg.conflation.annotations
  )();
  // Conflation annotation config
  const benchmarkAnnotationConfig = reprisConfig.parseAnnotations(
    reprisCfg.benchmark.annotations
  )();
  // Wire up the environment
  const envState = initializeEnvironment(environment, reprisCfg, skipTest);

  const testResult: TestResult = await circus(
    globalConfig,
    config,
    environment,
    runtime,
    testPath,
    sendMessageToJest
  );

  {
    let i = 0;
    const allTestResults = testResult.testResults;

    // pair up samples to their test result from Jest. They must appear in the same order
    // for 2 tests with the same name to be paired with the correct samples.
    for (const { sample, title, nth } of envState.getSamples()) {
      const key = JSON.stringify(title);
      let matched = false;

      while (i < allTestResults.length) {
        const ar = allTestResults[i++];

        const arKey = JSON.stringify(ar.ancestorTitles.concat(ar.title));
        if (key === arKey) {
          matched = true;

          if (ar.status !== 'passed') {
            // reject sample if the test failed
            break;
          }

          // Only duration samples supported
          if (!samples.duration.Duration.is(sample)) {
            throw new Error('Unknown sample type ' + sample[typeid]);
          }

          const sampleBag = annotate(sample, sampleAnnotations);
          const sampleBagJson = sampleBag.toJson();

          // assign annotations to the test case result
          const augmentedResult = ar as AugmentedAssertionResult;
          augmentedResult.repris = { sample: sampleBagJson };

          if (indexedSnapshot) {
            // load the previous samples of this benchmark from the cache
            const indexedBenchmark =
              indexedSnapshot.getBenchmark(title, nth) ?? f.DefaultBenchmark.empty({ title, nth });

            const newBenchmark = reconflateBenchmark(
              indexedBenchmark,
              { sample, annotations: sampleBagJson },
              reprisCfg.conflation.options,
              conflationAnnotationConfig,
              benchmarkAnnotationConfig,
            );

            // Update the index
            indexedSnapshot.updateBenchmark(newBenchmark);

            // publish the conflation annotations on the current test case result
            augmentedResult.repris.conflation = newBenchmark
              .annotations().get(newBenchmark.conflation()?.[uuid]!);

            // publish the current annotations on the current test case result
            augmentedResult.repris.benchmark = newBenchmark
              .annotations().get(newBenchmark[uuid]);
          }

          break;
        }
      }

      if (!matched) {
        throw new Error(
          `Couldn't pair sample "${title.concat(' ')}" to the test which produced it`
        );
      }
    }
  }

  const stat: AugmentedTestResult['repris'] = {
    cacheStat: {
      ...envState.stat(),
      stagedBenchmarks: 0,
      totalBenchmarks: 0,
    },
    snapshotStat: {
      updated: 0,
      updatedTotal: 0,
    },
    epochStat: {
      complete: false,
    },
  };

  if (globalConfig.updateSnapshot === 'all') {
    // when --updateSnapshot is specified
    dbg('Updating snapshots for %s', testPath);

    if (!indexedSnapshot) {
      throw new Error('Cache must be enabled to update snapshots');
    }

    const snapStat = await commitToBaseline(config, testPath, indexedSnapshot);
    testResult.snapshot.added += snapStat.added;
    testResult.snapshot.updated += snapStat.updated;

    stat.snapshotStat.updated = snapStat.updated + snapStat.added;
    stat.cacheStat.totalBenchmarks = snapStat.pending;
    stat.epochStat.complete = snapStat.pending === 0;
  } else if (indexedSnapshot) {
    // update pending/pendingReady
    for (const fixt of indexedSnapshot.allBenchmarks()) {
      stat.cacheStat.totalBenchmarks++;
      if (fixt.annotations().get(fixt[uuid])?.[f.annotations.stable]) {
        stat.cacheStat.stagedBenchmarks++;
      }
    }
  }

  if (indexedSnapshot) {
    // total tombstones in the index area is the total moved to snapshot in this epoch
    stat.snapshotStat.updatedTotal = iter.count(indexedSnapshot.allTombstones());
    // commit the new test run to the cache
    const e = await stagingAreaMgr.save(indexedSnapshot);
    Status.get(e);
  }

  // only augment the test result if there's any benchmarks
  if (stat.cacheStat.runBenchmarks > 0 || stat.cacheStat.skippedBenchmarks > 0) {
    (testResult as AugmentedTestResult).repris = stat;
  }

  return testResult;
}

/** Move benchmarks from the index to the baseline snapshot. */
async function commitToBaseline(
  config: Config.ProjectConfig,
  testPath: string,
  index: snapshots.Snapshot
) {
  const s = new snapshotManager.SnapshotFileManager(await BaselineResolver(config));
  const snapFile = await s.loadOrCreate(testPath);

  if (Status.isErr(snapFile)) {
    throw new Error(`Failed to load snapshot for test file:\n${snapFile[1]}`);
  }

  const snapshot = snapFile[0];
  const stat = { added: 0, updated: 0, pending: 0 };

  for (const bench of index.allBenchmarks()) {
    const bag = bench.annotations().get(bench[uuid]) ?? {};

    if (bag[f.annotations.stable]) {
      const { title, nth } = bench.name;
      if (snapshot.benchmarkState(title, nth) === snapshots.BenchmarkState.Stored) {
        stat.updated++;
      } else {
        stat.added++;
      }

      // copy the benchmark to the snapshot
      snapshot.updateBenchmark(bench);
      // allow the runner to skip this benchmark in future runs
      index.tombstone(title, nth);
    } else {
      // benchmark is not ready for snapshotting
      stat.pending++;
    }
  }

  const e = await s.save(snapshot);
  Status.get(e);

  return stat;
}

function annotate(
  newSample: samples.duration.Duration,
  request: Map<typeid, any>
): annotators.AnnotationBag {
  const [bag, err] = annotators.annotate(newSample, request);
  if (err) {
    dbg('Failed to annotate sample %s', err.message);
    return annotators.DefaultBag.from([]);
  } else {
    return bag!;
  }
}

function reconflateBenchmark(
  bench: f.AggregatedBenchmark<samples.duration.Duration>,
  newEntry: { sample: samples.duration.Duration; annotations: wt.AnnotationBag },
  opts: conflations.duration.Options,
  conflationRequest: Map<typeid, any>,
  benchmarkRequest: Map<typeid, any>,
): f.AggregatedBenchmark<samples.duration.Duration> {
  const allSamples = iter.collect(bench.samples())
    .map(s => asTuple([s.sample, bench.annotations().get(s.sample[uuid])]));

  allSamples.push([newEntry.sample, newEntry.annotations]);

  // Conflate the new and previous samples together
  const newConflation = conflations.duration.conflate(allSamples, opts);

  if (Status.isErr(newConflation)) {
    dbg('Failed to create conflation %s', newConflation[1].message);
    // return the original benchmark
    return bench;
  }

  // Update the aggregated benchmark, discarding sample(s)
  // rejected during the conflation analysis.
  const result = bench.addRun(newConflation[0]);

  // set sample annotation
  for (const { sample: s } of result.samples()) {
    if (s === newEntry.sample) result.annotations().set(s[uuid], newEntry.annotations);
  }

  // Annotate this conflation
  const conflationBag = annotators.annotate(newConflation[0], conflationRequest);

  if (Status.isErr(conflationBag)) {
    dbg('Failed to annotate conflation %s', conflationBag[1].message);
  } else {
    result.annotations().set(
      newConflation[0][uuid],
      Status.get(conflationBag).toJson()
    );
  }

  // Annotate the benchmark and store these annotations in the benchmark itself
  const benchmarkBag = annotators.annotate(result, benchmarkRequest);

  if (Status.isErr(benchmarkBag)) {
    dbg('Failed to annotate benchmark %s', benchmarkBag[1].message);
  } else {
    result.annotations().set(result[uuid], Status.get(benchmarkBag).toJson());
  }

  return result;
}

// Return a string that identifies the test (concat of parent describe block
// names + test title)
function getTestID(test: Circus.TestEntry): string[] {
  const titles = [];
  let parent: Circus.TestEntry | Circus.DescribeBlock | undefined = test;

  do {
    titles.unshift(parent.name);
  } while ((parent = parent.parent));

  titles.shift(); // remove TOP_DESCRIBE_BLOCK_NAME
  return titles;
}

/** A set which counts the number of times an item has been added */
export class RecordCounter<T> {
  index = new Map<T, number>();

  increment(item: T): number {
    const index = this.index;
    const x = (index.get(item) ?? 0) + 1;

    index.set(item, x);
    return x;
  }

  get(item: T): number {
    return this.index.get(item) ?? 0;
  }
}
