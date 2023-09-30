/// <reference types="jest" />

import { samples, stopwatch } from '@sampleci/samplers';
import { Status } from '@sampleci/base';

/** A function defined by the stopwatch test-runner  */
declare function onSample(
  matcherState: jest.MatcherState & Record<string, any>,
  sample: samples.Sample<unknown>
): void;

/** Current stopwatch opts */
declare function getSamplerOptions(): Partial<stopwatch.Options>;

const delay = (time: number) => new Promise<void>(res => setTimeout(res, time));
const getGC = () => global.gc;

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

(globalThis as any).sample = function(testName: string, fn: stopwatch.SamplerFn<[]>, timeout?: number) {
  const gc = getGC();
  const sw = new stopwatch.Sampler(fn, [], getSamplerOptions(), void 0, gc);
  const f = runStopwatch.bind(null, sw) as jest.ProvidesCallback;

  // create the jest test-case
  test(testName, f, timeout);
}
