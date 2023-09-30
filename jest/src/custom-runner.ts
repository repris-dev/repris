import { debug } from 'util';

import circus from 'jest-circus/runner';
import type { JestEnvironment } from '@jest/environment';
import type { Config } from '@jest/types';
import type { TestEvents, TestFileEvent } from '@jest/test-result';

import { annotators, samples, wiretypes as wt } from '@sampleci/samplers';
import { typeid, assert } from '@sampleci/base';
import { SampleCacheManager, RecordCounter } from './cacheManager.js';

const dbg = debug('sci:runner');

function initializeEnvironment(
  environment: JestEnvironment,
  onSample: (matcherState: any, sample: samples.Sample<unknown>) => void
) {
  environment.global.onSample = onSample;
}

export default async function testRunner(
  globalConfig: Config.GlobalConfig,
  config: Config.ProjectConfig,
  environment: JestEnvironment,
  runtime: typeof import('jest-runtime'),
  testPath: string,
  sendMessageToJest?: TestFileEvent
) {
  const cacheFile = new SampleCacheManager(config, testPath);
//  const fixtures = [] as ReportFixture[];
  const counter = new RecordCounter<string>();

  let pendingSample: samples.Sample<unknown> | undefined;

  /** Exposed in the environment */
  function onSample(
    _matcherState: jest.MatcherState & Record<string, any>,
    sample: samples.Sample<unknown>
  ) {
    assert.eq(pendingSample, undefined, 'Expected only one sample per test');
    pendingSample = sample;
  }

  function sendMessageWrapper(evt: keyof TestEvents, args: any) {
    if (evt === 'test-case-result') {
      const [_testPath, assertionResult] = args as TestEvents[typeof evt];

      if (assertionResult
        && pendingSample?.[typeid] === samples.Duration[typeid]
      ) {        
        // assign serialized sample generated during the most recent test case
        // to this test case result
        (assertionResult as any).sample = pendingSample.toJson();

        const title = assertionResult.ancestorTitles.concat(assertionResult.title)
        const s = pendingSample as samples.Duration;

        if (config.cache) {
          // nth-time in this test run this fixture name has been seen
          const nth = counter.increment(JSON.stringify(title));
          const aggFixture = cacheFile.getFixture(title, nth);

          if (aggFixture.samples.length > 0) {
            
            // load the previous samples
            const index = new Map(aggFixture.samples.map(
              s => [s.sample, s])
            );

            // load the current sample and its annotations
            index.set(s, { sample: s, annotations: {}});
   
            // conflate the current and previous samples
            const newConflation = new samples.DurationConflation();
            for (const s of index.keys()) newConflation.push(s);
            
            { // annotate this conflation
              // TODO: config file
              const [bag, err] = annotators.annotate(newConflation, new Map([
                ['mode:hsm:conflation' as typeid, {}],
                ['mode:hsm:conflation:ci-rme' as typeid, {}]
              ]));
  
              if (err) {
                dbg('Failed to annotate conflation %s', err.message);
              } else {
                const c: wt.SampleConflation = {
                  '@type': samples.DurationConflation[typeid],
                  annotations: bag!.toJson()
                };

                // overwrite the previous conflation annotations
                aggFixture.conflation = c;
                // publish the conflation
                (assertionResult as any).conflation = c;
              }
            }

            // cache the best K samples.
            const bestSamples = [];

            for (const selectedSample of newConflation.samples(5, true)) {
              assert.is(index.has(selectedSample), 'Sample should be indexed');
              bestSamples.push(index.get(selectedSample)!);
            }

            aggFixture.samples = bestSamples;
          } else {
            aggFixture.samples.push({
              sample: s,
              annotations: {}
            });
          }

          cacheFile.updateFixture(title, nth, aggFixture);
        }
      }

      // reset for the next sample
      pendingSample = undefined;
    }

    sendMessageToJest?.(evt, args);
  }

  initializeEnvironment(environment, onSample);

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
