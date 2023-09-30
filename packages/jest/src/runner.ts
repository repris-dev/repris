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
  fixture as f,
} from '@repris/samplers';
import { typeid, assert, iterator as iter, Status, uuid } from '@repris/base';

import * as reprisConfig from './config.js';
import { BaselineResolver, IndexResolver } from './snapshotUtils.js';

export interface AugmentedAssertionResult extends AssertionResult {
  repris?: {
    /** Sample annotations for this fixture */
    sample?: wt.AnnotationBag;
    /** Conflation annotations for this fixture */
    conflation?: wt.AnnotationBag;
  };
}

export interface AugmentedTestResult extends TestResult {
  repris?: {
    cacheStat: {
      /** Count of fixtures run which produced at least one sample */
      runFixtures: number;
      /** Count of fixtures skipped in this test run */
      skippedFixtures: number;
      /** Count of new fixtures seen in this test run */
      newFixtures: number;
      /** Count of all fixtures in the cache after the test run */
      totalFixtures: number;
      /**
       * Count of fixtures which are ready for snapshotting after
       * the test run. This is only positive when shapshots are not being
       * updated.
       */
      stagedFixtures: number;
    };
    snapshotStat: {
      /** Count of fixtures moved to snapshots in the current test run */
      updated: number;
      /**
       * Count of fixtures moved to snapshots in the current epoch (i.e.
       * over all runs)
       */
      updatedTotal: number;
    };
    epochStat: {
      /**
       * True if the snapshots are being updated and all fixtures have
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
  getState: (title: string[], nth: number) => snapshots.FixtureState
) {
  const samples: { title: string[]; nth: number; sample: samples.Sample<unknown> }[] = [];
  const newSamples: { title: string[]; nth: number; sample: samples.Sample<unknown> }[] = [];
  const titleCount = new RecordCounter<string>();
  const stat = {
    runFixtures: 0,
    skippedFixtures: 0,
    newFixtures: 0,
  };

  let title: string[] | undefined;
  let nth = -1;

  environment.global.crypto ??= globalThis.crypto ??= {
    randomUUID() {
      return crypto.randomUUID() as any;
    },
  } as any;

  environment.global.getSamplerOptions = () => cfg.sampler.options;
  environment.global.onSample = (_matcherState: any, sample: samples.Sample<unknown>) => {
    assert.isDefined(title, 'No test running');

    if (newSamples.length === 0) {
      stat.runFixtures++;

      if (getState(title, nth) === snapshots.FixtureState.Unknown) {
        stat.newFixtures++;
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
      if (state === snapshots.FixtureState.Tombstoned) {
        evt.test.mode = 'skip';
        stat.skippedFixtures++;
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
    indexedSnapshot?.fixtureState(title, nth) ?? snapshots.FixtureState.Unknown;

  // Sample annotation config
  const sampleAnnotations = reprisConfig.parseAnnotations(reprisCfg.sample.annotations)();
  // Conflation annotation config
  const conflationAnnotationConfig = reprisConfig.parseAnnotations(
    reprisCfg.conflation.annotations
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
          if (!samples.Duration.is(sample)) {
            throw new Error('Unknown sample type ' + sample[typeid]);
          }

          const sampleBag = annotate(sample, sampleAnnotations);
          const sampleBagJson = sampleBag.toJson();

          // assign annotations to the test case result
          const augmentedResult = ar as AugmentedAssertionResult;
          augmentedResult.repris = { sample: sampleBagJson };

          if (indexedSnapshot) {
            // load the previous samples of this fixture from the cache
            const indexedFixture =
              indexedSnapshot.getFixture(title, nth) ?? new f.DefaultFixture({ title, nth }, []);

            const newFixture = reconflateFixture(
              { sample, annotations: sampleBagJson },
              reprisCfg.conflation.options,
              conflationAnnotationConfig,
              indexedFixture,
            );

            // Update the index
            indexedSnapshot.updateFixture(newFixture);

            // publish the conflation annotations on the current test case result
            augmentedResult.repris.conflation = newFixture
              .annotations().get(newFixture.conflation()?.[uuid]!);
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
      stagedFixtures: 0,
      totalFixtures: 0,
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
    stat.cacheStat.totalFixtures = snapStat.pending;
    stat.epochStat.complete = snapStat.pending === 0;
  } else if (indexedSnapshot) {
    // update pending/pendingReady
    for (const f of indexedSnapshot.allFixtures()) {
      stat.cacheStat.totalFixtures++;

      const conf = f.conflation();
      if (conf && f.annotations().get(conf[uuid])?.[conflations.annotations.isReady]) {
        stat.cacheStat.stagedFixtures++;
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

  // only augment the test result if there's any benchmark fixtures
  if (stat.cacheStat.runFixtures > 0 || stat.cacheStat.skippedFixtures > 0) {
    (testResult as AugmentedTestResult).repris = stat;
  }

  return testResult;
}

/** Move fixtures from the index to the baseline snapshot. */
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

  for (const f of index.allFixtures()) {
    const conf = f.conflation();
    const bag = conf ? f.annotations().get(conf[uuid]) ?? {} : {};

    if (bag[conflations.annotations.isReady]) {
      const { title, nth } = f.name;
      if (snapshot.fixtureState(title, nth) === snapshots.FixtureState.Stored) {
        stat.updated++;
      } else {
        stat.added++;
      }

      // copy the fixture to the snapshot
      snapshot.updateFixture(f);
      // allow the runner to skip this fixture in future runs
      index.tombstone(title, nth);
    } else {
      // fixture is not ready for snapshotting
      stat.pending++;
    }
  }

  const e = await s.save(snapshot);
  Status.get(e);

  return stat;
}

function annotate(
  newSample: samples.Duration,
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

function reconflateFixture(
  newEntry: { sample: samples.Duration; annotations: wt.AnnotationBag },
  opts: Partial<conflations.DurationOptions>,
  request: Map<typeid, any>,
  indexedFixture: f.AggregatedFixture<samples.Duration>
): f.AggregatedFixture<samples.Duration> {
  // The existing cached samples
  const fixtureIndex = new Map(
    iter.map(indexedFixture.samples(), s => [s, indexedFixture.annotations().get(s[uuid])])
  );

  // Add the new sample and its annotations
  fixtureIndex.set(newEntry.sample, newEntry.annotations);

  // Conflate the new and previous samples together
  const newConflation = new conflations.Duration(fixtureIndex.keys()).analyze(opts);

  // Annotate this conflation if its ready
  const [conflationBag, err] = annotators.annotate(newConflation, request);

  if (err) {
    dbg('Failed to annotate conflation %s', err.message);
  }

  // Update the aggregated fixture, discarding sample(s) rejected in the conflation analysis.
  const fx = new f.DefaultFixture(
    indexedFixture.name,
    iter.map(
      newConflation.stat().filter(x => x.status !== 'rejected'),
      best => best.sample!
    ),
    newConflation
  );

  for (const s of fx.samples()) {
    const bag = indexedFixture.annotations().get(s[uuid]);
    if (bag) {
      fx.annotations().set(s[uuid], bag);
    }
  }

  if (newConflation) {
    fx.annotations().set(newConflation[uuid], conflationBag!.toJson());
  }

  return fx;
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
