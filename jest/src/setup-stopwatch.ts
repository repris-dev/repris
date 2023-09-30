/// <reference types="jest" />

import { samples, stopwatch } from '@sampleci/samplers';
import { Status } from '@sampleci/base';

declare function onSample(matcherState: any, sample: samples.Sample<unknown>): void;

function runStopwatch(
  sw: stopwatch.Sampler<[]>,
): void | Promise<void> {
  const result = sw.run();
  const matcherState = expect.getState();

  if (result instanceof Promise) {
    return result.then((s: Status) => {
      Status.get(s);
      onSample(matcherState, sw.sample());
    });
  }

  Status.get(result);
  onSample(matcherState, sw.sample());
}

function getGC(): (() => void) | undefined {
  return global.gc;
}

(globalThis as any).sample = function(testName: string, fn: stopwatch.SamplerFn<[]>) {
  const gc = getGC();
  const sw = new stopwatch.Sampler(fn, [], void 0, void 0, gc);
  const f = runStopwatch.bind(null, sw) as jest.ProvidesCallback;

  test(testName, f);
}
