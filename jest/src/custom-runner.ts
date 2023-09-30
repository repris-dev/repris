import type { JestEnvironment } from '@jest/environment';
import type { Config } from '@jest/types';
import type { TestEvents, TestFileEvent } from '@jest/test-result';
import { samples } from '@sampleci/samplers';

import circus from 'jest-circus/runner';


//function runStopwatch(
//  sw: stopwatch.Sampler<[]>,
//  onSample: (matcherState: any, sample: samples.Sample<unknown>) => void
//): Promise<void> | void {
//  const result = sw.run();
//
//  if (result instanceof Promise) {
//    return result.then((s: Status) => {
//      Status.get(s);
//      onSample(null, sw.sample());
//    });
//  }
//
//  Status.get(result);
//  onSample(null, sw.sample());
//}

function initializeEnvironment(
  environment: JestEnvironment,
  onSample: (matcherState: any, sample: samples.Sample<unknown>) => void
) {
  const g = environment.global;
  g.onSample = onSample;
}

export default async function testRunner(
  globalConfig: Config.GlobalConfig,
  config: Config.ProjectConfig,
  environment: JestEnvironment,
  runtime: typeof import('jest-runtime'),
  testPath: string,
  sendMessageToJest?: TestFileEvent,
) {
  const samples = new Map<string, samples.Sample<unknown>>();

  const sendMessageWrapper: TestFileEvent = (evt, args) => {
    if (evt === 'test-case-result') {
      const [_path, assertionResult] = args as TestEvents['test-case-result'];
      
      if (assertionResult && samples.has(assertionResult.fullName)) {
        // assign samples generated during the test case to the associated test case result
        (assertionResult as any).sample = samples.get(assertionResult.fullName)!.toJson();
      }
    }

    if (sendMessageToJest) sendMessageToJest(evt, args);
  }

  initializeEnvironment(
    environment,
    (matcherState: any, sample: samples.Sample<unknown>) =>
      samples.set(matcherState.currentTestName, sample)
  );

  return await circus(globalConfig, config, environment, runtime, testPath, sendMessageWrapper);
}