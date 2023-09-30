import type { JestEnvironment } from '@jest/environment';
import type { Config } from '@jest/types';
import type { TestEvents, TestFileEvent } from '@jest/test-result';
import { samples } from '@sampleci/samplers';
import circus from 'jest-circus/runner';

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
  sendMessageToJest?: TestFileEvent,
) {
  const samples = new Map<string, samples.Sample<unknown>>();

  function sendMessageWrapper(evt: keyof TestEvents, args: any) {
    if (evt === 'test-case-result') {
      const [_testPath, assertionResult] = args as TestEvents['test-case-result'];
      const key = assertionResult.fullName;

      if (assertionResult && samples.has(key)) {
        // assign serialized samples generated during the test case to the associated test case result
        (assertionResult as any).sample = samples.get(key)!.toJson();
        samples.delete(key);
      }
    }

    if (sendMessageToJest) sendMessageToJest(evt, args);
  }

  function onSample(
    matcherState: jest.MatcherState & Record<string, any>,
    sample: samples.Sample<unknown>
  ) {
    const key = matcherState.currentTestName;
    samples.set(key, sample);
  }

  initializeEnvironment(environment, onSample);

  return await circus(
    globalConfig,
    config,
    environment,
    runtime,
    testPath,
    sendMessageWrapper
  );
}