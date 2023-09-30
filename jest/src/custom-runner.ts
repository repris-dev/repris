import { debug } from 'util';

import circus from 'jest-circus/runner';
import type { JestEnvironment } from '@jest/environment';
import type { Config } from '@jest/types';
import type { TestEvents, TestFileEvent } from '@jest/test-result';

import { annotators, samples, wiretypes as wt } from '@sampleci/samplers';
import { typeid, assert, iterator } from '@sampleci/base';
import { SampleCacheManager, RecordCounter, AggregatedFixture } from './cacheManager.js';
import * as sciConfig from './config.js';

const dbg = debug('sci:runner');

function initializeEnvironment(
  environment: JestEnvironment,
  cfg: sciConfig.SCIConfig,
  onSample: (matcherState: any, sample: samples.Sample<unknown>) => void,
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
) {
  const cfg = await sciConfig.load(globalConfig.rootDir);
  const cacheFile = new SampleCacheManager(config, testPath);
  const counter = new RecordCounter<string>();

  let pendingSample: samples.Sample<unknown> | undefined;

  /** Exposed in the test environment */
  function onSample(
    _matcherState: jest.MatcherState & Record<string, any>,
    sample: samples.Sample<unknown>
  ) {
    assert.eq(pendingSample, undefined, 'Expected only one sample per test');
    pendingSample = sample;
  }

  /** Conflation annotation config */
  const conflationAnnotations = new Map(iterator.map(cfg.conflation.annotations,
    c => typeof c === 'string' ? [c as typeid, {}] : [c[0] as typeid , c[1].opts ?? {}]));

  function sendMessageWrapper(evt: keyof TestEvents, args: any) {
    if (evt === 'test-case-result') {
      const [_testPath, assertionResult] = args as TestEvents[typeof evt];

      if (assertionResult
        && pendingSample?.[typeid] === samples.duration.Duration[typeid]
      ) {
        const s = pendingSample as samples.duration.Duration;
        
        // assign serialized sample generated during the most recent test case
        // to this test case result
        (assertionResult as any).sample = s.toJson();

        const title = assertionResult.ancestorTitles.concat(assertionResult.title)        

        if (config.cache) {
          // nth-time in this test run this fixture name has been seen
          const nth = counter.increment(JSON.stringify(title));
          // load the previous samples of this fixture from the cache
          const cachedFixture = cacheFile.getFixture(title, nth);

          if (cachedFixture.samples.length > 0) {
            // conflate previous and current samples
            const conflation = conflate(s, cachedFixture, conflationAnnotations);

            // publish the conflation on the current test case result
            (assertionResult as any).conflation = conflation;
          } else {
            cachedFixture.samples.push({
              sample: s,
              annotations: {}
            });
          }

          cacheFile.updateFixture(title, nth, cachedFixture);
        }
      }

      // reset for the next sample
      pendingSample = undefined;
    }

    sendMessageToJest?.(evt, args);
  }

  initializeEnvironment(environment, cfg, onSample);

  const testResult = await circus(
    globalConfig,
    config,
    environment,
    runtime,
    testPath,
    sendMessageWrapper
  );
  
  if (config.cache) {
    // commit the new test run
    cacheFile.save();
  }

  return testResult;
}

function conflate(
  newSample: samples.duration.Duration,
  cacheState: AggregatedFixture<samples.duration.Duration>,
  conflationAnnotations: Map<typeid, any>,
): wt.SampleConflation | undefined {
  let result: wt.SampleConflation | undefined;

  const index = new Map(cacheState.samples.map(s => [s.sample, s]));

  // load the current sample and its annotations
  index.set(newSample, { sample: newSample, annotations: {} });

  // conflate the current and previous samples together
  const newConflation = new samples.duration.Conflation(index.keys());

  // annotate this conflation
  if (conflationAnnotations.size > 0) {
    const [bag, err] = annotators.annotate(newConflation, conflationAnnotations);

    if (err) {
      dbg('Failed to annotate conflation %s', err.message);
    } else {
      result = {
        '@type': samples.duration.Conflation[typeid],
        annotations: bag!.toJson()
      };

      // overwrite the previous conflation annotations
      cacheState.conflation = result;
    }
  }

  const bestSamples: AggregatedFixture<samples.duration.Duration>['samples'] = [];
  
  // Update the aggregated fixture with the best K samples, discarding the worst sample.
  for (const best of newConflation.samples(true)) {
    assert.is(index.has(best), 'Sample should be indexed');
    bestSamples.push(index.get(best)!);
  }

  cacheState.samples = bestSamples;
  return result;
}
