import { debug } from 'util';

import HasteMap from 'jest-haste-map';
import circus from 'jest-circus/runner';
import type { JestEnvironment } from '@jest/environment';
import type { Config } from '@jest/types';
import type { AssertionResult, TestEvents, TestFileEvent, TestResult } from '@jest/test-result';

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
  onSample: (matcherState: any, sample: samples.Sample<unknown>) => void
) {
  environment.global.onSample = onSample;
  environment.global.getSamplerOptions = () => cfg.sampler.options;
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

  /** Conflation annotation config */
  const sampleAnnotations = normaliseAnnotationCfg(cfg.sample.annotations);
  /** Conflation annotation config */
  const conflationAnnotations = normaliseAnnotationCfg(cfg.conflation.annotations);
  /** Fixture title state */
  const titleCount = new snapshots.RecordCounter<string>();

  let pendingSample: samples.Sample<unknown> | undefined;

  /** Exposed in the test environment */
  function onSample(
    _matcherState: jest.MatcherState & Record<string, any>,
    sample: samples.Sample<unknown>
  ) {
    assert.eq(pendingSample, undefined, 'Expected only one sample per test');
    pendingSample = sample;
  }

  function onTestEvent(evt: keyof TestEvents, args: any) {
    if (evt === 'test-case-result') {
      const [_testPath, assertionResult] = args as TestEvents[typeof evt];

      if (assertionResult && samples.Duration.is(pendingSample)) {
        const augmentedResult = assertionResult as AugmentedAssertionResult;

        // assign serialized sample generated during the most recent test case
        // to this test case result
        augmentedResult.sci = { sample: annotate(pendingSample, sampleAnnotations) };

        if (cacheFile) {
          const title = assertionResult.ancestorTitles.concat(assertionResult.title);
          // nth-time in this test run this fixture name has been seen
          const nth = titleCount.increment(JSON.stringify(title));
          // load the previous samples of this fixture from the cache
          const cachedFixture = cacheFile.getOrCreateFixture(title, nth);
          // publish the conflation on the current test case result
          augmentedResult.sci.conflation = conflate(
            pendingSample,
            cachedFixture,
            conflationAnnotations,
            cfg.conflation.options
          )?.annotations;

          // Update the cache
          cacheFile.updateFixture(title, nth, cachedFixture);
        }
      }

      // reset for the next sample
      pendingSample = undefined;
    }

    sendMessageToJest?.(evt, args);
  }

  initializeEnvironment(environment, cfg, onSample);

  const testResult: TestResult = await circus(
    globalConfig,
    config,
    environment,
    runtime,
    testPath,
    onTestEvent
  );

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
