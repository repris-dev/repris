import { debug } from 'util';

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
} from '@repris/samplers';
import { typeid, assert, iterator, Status, array } from '@repris/base';

import * as reprisConfig from './config.js';
import { SnapshotResolver, StagingAreaResolver } from './snapshotUtils.js';

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
      /**  */
      complete: boolean;
    };
  };
}

const dbg = debug('repris:runner');

function initializeEnvironment(
  environment: JestEnvironment,
  cfg: reprisConfig.SCIConfig,
  getState: (title: string[], nth: number) => snapshots.FixtureState
) {
  const samples: { title: string[]; nth: number; sample: samples.Sample<unknown> }[] = [];
  const newSamples: { title: string[]; nth: number; sample: samples.Sample<unknown> }[] = [];
  const titleCount = new snapshots.RecordCounter<string>();
  const stat = {
    runFixtures: 0,
    skippedFixtures: 0,
    newFixtures: 0,
  };

  let title: string[] | undefined;
  let nth = -1;

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
  const cfg = await reprisConfig.load(globalConfig.rootDir);
  const stagingAreaMgr = new snapshotManager.SnapshotFileManager(StagingAreaResolver(config));

  // cache
  let saSnapshot: snapshots.Snapshot | undefined;

  if (config.cache) {
    const sCacheFile = await stagingAreaMgr.loadOrCreate(testPath);

    if (Status.isErr(sCacheFile)) {
      throw new Error(`Failed to load staging area for test file:\n${sCacheFile[1]}`);
    }

    saSnapshot = sCacheFile[0];
  }

  // Don't re-run benchmarks which were committed to the snapshot in a previous run
  const skipTest = (title: string[], nth: number) =>
    saSnapshot?.fixtureState(title, nth) ?? snapshots.FixtureState.Unknown;

  // Conflation annotation config
  const sampleAnnotations = normaliseAnnotationCfg(cfg.sample.annotations);
  // Conflation annotation config
  const conflationAnnotations = normaliseAnnotationCfg(cfg.conflation.annotations);
  // Wire up the environment
  const envState = initializeEnvironment(environment, cfg, skipTest);

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

    // pair up samples to their test result from Jest. They must be in the same order
    for (const { sample, title, nth } of envState.getSamples()) {
      const key = JSON.stringify(title);
      let matched = false;

      while (i < allTestResults.length) {
        const ar = allTestResults[i++];

        const arKey = JSON.stringify(ar.ancestorTitles.concat(ar.title));
        if (ar.status === 'passed' && key === arKey) {
          matched = true;

          if (!samples.Duration.is(sample)) {
            throw new Error('Unknown sample type ' + sample[typeid]);
          }

          const augmentedResult = ar as AugmentedAssertionResult;
          // assign serialized sample generated during the most recent test case
          // to this test case result
          augmentedResult.repris = {
            sample: annotate(sample, sampleAnnotations),
          };

          if (saSnapshot) {
            // load the previous samples of this fixture from the cache
            const cachedFixture = saSnapshot.getOrCreateFixture(title, nth);
            // publish the conflation on the current test case result
            augmentedResult.repris.conflation = conflate(
              sample,
              cachedFixture,
              conflationAnnotations,
              cfg.conflation.options
            )?.annotations;

            // Update the cache
            saSnapshot.updateFixture(title, nth, cachedFixture);
          }

          break;
        }
      }

      if (!matched) {
        throw new Error("Couldn't pair sample to the test which produced it");
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

    if (!saSnapshot) {
      throw new Error('Cache must be enabled to update snapshots');
    }

    const snapStat = await commitToSnapshot(config, testPath, saSnapshot);
    testResult.snapshot.added += snapStat.added;
    testResult.snapshot.updated += snapStat.updated;

    (stat.snapshotStat.updated = snapStat.updated + snapStat.added),
      (stat.cacheStat.totalFixtures = snapStat.pending);
    stat.epochStat.complete = snapStat.pending === 0;
  } else if (saSnapshot) {
    // update pending/pendingReady
    for (const f of saSnapshot.allFixtures()) {
      stat.cacheStat.totalFixtures++;

      if (f.conflation?.annotations['conflation:ready']) {
        stat.cacheStat.stagedFixtures++;
      }
    }
  }

  if (saSnapshot) {
    // total tombstones in the staging area is the total moved to snapshot in this epoch
    stat.snapshotStat.updatedTotal = iterator.count(saSnapshot.allTombstones());
    // commit the new test run to the cache
    const e = await stagingAreaMgr.save(saSnapshot);
    Status.get(e);
  }

  // only augment the test result if there's any benchmark fixtures
  if (stat.cacheStat.runFixtures > 0 || stat.cacheStat.skippedFixtures > 0) {
    (testResult as AugmentedTestResult).repris = stat;
  }

  return testResult;
}

/** Move fixtures from the staging area to the snapshot */
async function commitToSnapshot(
  config: Config.ProjectConfig,
  testPath: string,
  stagingArea: snapshots.Snapshot
) {
  const s = new snapshotManager.SnapshotFileManager(await SnapshotResolver(config));
  const snapFile = await s.loadOrCreate(testPath);

  if (Status.isErr(snapFile)) {
    throw new Error(`Failed to load snapshot for test file:\n${snapFile[1]}`);
  }

  const snapshot = snapFile[0];
  const stat = { added: 0, updated: 0, pending: 0 };

  for (const f of stagingArea.allFixtures()) {
    const bag = f.conflation?.annotations ?? {};

    if (bag['conflation:ready']) {
      const { title, nth } = f.name;

      if (snapshot.fixtureState(title, nth) === snapshots.FixtureState.Stored) {
        stat.updated++;
      } else {
        stat.added++;
      }

      // copy the fixture to the snapshot
      snapshot.updateFixture(title, nth, f);
      // allow the runner to skip this fixture in future runs
      stagingArea.tombstone(title, nth);
    } else {
      // fixture is not ready for snapshotting
      stat.pending++;
    }
  }

  const e = await s.save(snapshot);
  Status.get(e);
  return stat;
}

function normaliseAnnotationCfg(
  annotations: (string | [id: string, config: reprisConfig.AnnotationConfig])[]
): Map<typeid, any> {
  return new Map(
    iterator.map(annotations, (c) =>
      typeof c === 'string' ? [c as typeid, {}] : [c[0] as typeid, c[1].options ?? {}]
    )
  );
}

function annotate(
  newSample: samples.Duration,
  annotations: Map<typeid, any>
): wt.AnnotationBag | undefined {
  const [bag, err] = annotators.annotate(newSample, annotations);
  if (err) {
    dbg('Failed to annotate sample %s', err.message);
  } else {
    return bag!.toJson();
  }
}

function conflate(
  newSample: samples.Duration,
  cacheState: snapshots.AggregatedFixture<samples.Duration>,
  annotations: Map<typeid, any>,
  opts?: Partial<conflations.DurationOptions>
): wt.Conflation | undefined {
  // The existing cached samples
  const index = new Map(cacheState.samples.map((s) => [s.sample, s]));

  // the new sample and its annotations
  index.set(newSample, { sample: newSample, annotations: {} });

  // conflate the current and previous samples together
  const newConflation = new conflations.Duration(index.keys(), opts);

  let result: wt.Conflation | undefined;

  // annotate this conflation
  if (annotations.size > 0) {
    const [bag, err] = annotators.annotate(newConflation, annotations);

    if (err) {
      dbg('Failed to annotate conflation %s', err.message);
    } else {
      result = {
        '@type': conflations.Duration[typeid],
        annotations: bag!.toJson(),
      };

      // overwrite the previous conflation annotations
      cacheState.conflation = result;
    }
  }

  const bestSamples: snapshots.AggregatedFixture<samples.Duration>['samples'] = [];

  // Update the aggregated fixture with the best K samples, discarding the worst sample.
  for (const best of newConflation.samples(false)) {
    assert.is(index.has(best), 'Sample should be indexed');
    bestSamples.push(index.get(best)!);
  }

  cacheState.samples = bestSamples;
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
