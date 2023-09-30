/// <reference types="jest" />

import { samples, stopwatch } from '@sampleci/samplers';
import { Status } from '@sampleci/base';

/** A function defined by the stopwatch test-runner in the test environment */
declare function onSample(
  matcherState: any,
  sample: samples.Sample<unknown>
): void;

const delay = (time: number) => new Promise<void>(res => setTimeout(res, time));

async function runStopwatch(
  sw: stopwatch.Sampler<[]>,
): Promise<void> {
  // Give jest an opportunity to render when running in-band
  await delay(0);

  const result = await sw.run();
  const matcherState = expect.getState();

  // throws if the result is an error
  Status.get(result);

  // report the sample
  onSample(matcherState, sw.sample());

  // Give jest an opportunity to render when running in-band
  return delay(0);
}

function getGC(): (() => void) | undefined {
  return global.gc;
}

(globalThis as any).sample = function(testName: string, fn: stopwatch.SamplerFn<[]>, timeout?: number) {
  const gc = getGC();
  const sw = new stopwatch.Sampler(fn, [], void 0, void 0, gc);
  const f = runStopwatch.bind(null, sw) as jest.ProvidesCallback;

  test(testName, f, timeout);
}
