import { debug } from 'util';

import HasteMap from 'jest-haste-map';
import circus from 'jest-circus/runner';
import type { JestEnvironment } from '@jest/environment';
import type { Circus, Config } from '@jest/types';
import type { AssertionResult, TestFileEvent, TestResult } from '@jest/test-result';

import { annotators, samples, conflations, wiretypes as wt, snapshots } from '@sampleci/samplers';
import { typeid, assert, iterator, Status } from '@sampleci/base';

import * as sfm from './SnapshotFileManager.js';
import { buildSnapshotResolver } from './snapshotResolver.js';
import * as sciConfig from './config.js';

export interface AugmentedAssertionResult extends AssertionResult {
  sci?: {
    /** Sample annotations for this fixture */
    sample?: wt.AnnotationBag;
    /** Conflation annotations for this fixture */
    conflation?: wt.AnnotationBag;
  };
}

const dbg = debug('sci:runner');

function initializeEnvironment(
  environment: JestEnvironment,
  cfg: sciConfig.SCIConfig,
  skipTest: (title: string[], nth: number) => boolean,
) {
  const samples: { title: string[]; nth: number; sample: samples.Sample<unknown> }[] = [];
  const titleCount = new snapshots.RecordCounter<string>();

  let title: string[] | undefined;
  let nth = -1;

  environment.global.getSamplerOptions = () => cfg.sampler.options;
  environment.global.onSample = (_matcherState: any, sample: samples.Sample<unknown>) => {
    assert.isDefined(title, 'No test running');
    samples.push({ title, nth, sample });
  };

  const hte = environment.handleTestEvent;
  const newe: Circus.EventHandler = (evt, state) => {
    if (evt.name === 'test_start') {
      title = getTestID(evt.test);
      nth = titleCount.increment(JSON.stringify(title));

      if (skipTest(title, nth)) {
        evt.test.mode = 'skip';
      }
    }

    return hte?.(evt as Circus.SyncEvent, state);
  };

  environment.handleTestEvent = newe;

  return {
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
  const cfg = await sciConfig.load(globalConfig.rootDir);
  const cacheMgr = new sfm.SnapshotFileManager(HasteResolver(config));

  let cacheFile: snapshots.Snapshot | undefined;

  if (config.cache) {
    const sCacheFile = await cacheMgr.loadOrCreate(testPath);

    if (Status.isErr(sCacheFile)) {
      throw new Error(`Failed to load cache for test file:\n${sCacheFile[1]}`);
    }

    cacheFile = sCacheFile[0];
  }

  // Don't re-run benchmarks which were committed to the snapshot in a previous run
  const skipTest = (title: string[], nth: number) => cacheFile?.isTombstoned(title, nth) ?? false;
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

        if (key === arKey) {
          matched = true;

          if (!samples.Duration.is(sample)) {
            throw new Error('Unknown sample type ' + sample[typeid]);
          }

          const augmentedResult = ar as AugmentedAssertionResult;
          // assign serialized sample generated during the most recent test case
          // to this test case result
          augmentedResult.sci = { sample: annotate(sample, sampleAnnotations) };

          if (cacheFile) {
            // load the previous samples of this fixture from the cache
            const cachedFixture = cacheFile.getOrCreateFixture(title, nth);
            // publish the conflation on the current test case result
            augmentedResult.sci.conflation = conflate(
              sample,
              cachedFixture,
              conflationAnnotations,
              cfg.conflation.options
            )?.annotations;

            // Update the cache
            cacheFile.updateFixture(title, nth, cachedFixture);
          }

          break;
        }
      }

      if (!matched) {
        throw new Error("Couldn't pair sample to the test which produced it");
      }
    }
  }

  // when --updateSnapshot is specified
  if (globalConfig.updateSnapshot === 'all') {
    dbg('Updating snapshots for ' + testPath);

    if (!cacheFile) {
      throw new Error('Cache must be enabled to update snapshots');
    }

    const stat = await commitToSnapshot(config, testPath, cacheFile);
    testResult.snapshot.added += stat.added;
    testResult.snapshot.updated += stat.updated;
  }

  if (cacheFile) {
    // commit the new test run to the cache
    const e = await cacheMgr.save(cacheFile);
    Status.get(e);
  }

  return testResult;
}

async function commitToSnapshot(
  config: Config.ProjectConfig,
  testPath: string,
  cacheFile: snapshots.Snapshot
) {
  const s = new sfm.SnapshotFileManager(await SnapshotResolver(config));
  const snapFile = await s.loadOrCreate(testPath);

  if (Status.isErr(snapFile)) {
    throw new Error(`Failed to load snapshot for test file:\n${snapFile[1]}`);
  }

  const snapshot = snapFile[0];
  const stat = { added: 0, updated: 0 };

  for (const f of cacheFile.allFixtures()) {
    const bag = f.conflation?.annotations ?? {};

    if (bag['conflation:ready']) {
      const { title, nth } = f.name;

      if (snapshot.hasFixture(title, nth)) {
        stat.updated++;
      } else {
        stat.added++;
      }

      // copy the fixture to the snapshot
      snapshot.updateFixture(title, nth, f);
      // allow the runner to skip this fixture in future runs
      cacheFile.tombstone(title, nth);
    }
  }

  const e = await s.save(snapshot);
  Status.get(e);
  return stat;
}

function normaliseAnnotationCfg(
  annotations: (string | [id: string, config: sciConfig.AnnotationConfig])[]
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

function HasteResolver(config: Config.ProjectConfig): sfm.PathResolver {
  const haste = HasteMap.default.getStatic(config);
  const resolver = (testFilePath: string) =>
    haste.getCacheFilePath(config.cacheDirectory, `sample-cache-${config.id}`, testFilePath);

  return resolver;
}

async function SnapshotResolver(config: Config.ProjectConfig): Promise<sfm.PathResolver> {
  const resolver = await buildSnapshotResolver(config);
  return (testFilePath: string) => resolver.resolveSnapshotPath(testFilePath);
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
