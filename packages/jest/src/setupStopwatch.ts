/// <reference types="jest" />

import { samples, samplers } from '@repris/samplers';
import { Status, iterator } from '@repris/base';

/** defined by the stopwatch test-runner  */
declare function onSample(
  matcherState: jest.MatcherState & Record<string, any>,
  sample: samples.Sample<unknown>,
): void;

/** Current stopwatch opts, defined by the test-runner */
declare function getSamplerOptions(): samplers.stopwatch.Options;

/** Current sample opts, defined by the test-runner */
declare function getSampleOptions(): samples.duration.Options;

const delay = (time: number) => new Promise<void>(res => setTimeout(res, time));
const getGC = () => global.gc as samplers.stopwatch.V8GC | undefined;

async function runStopwatch<T extends any[]>(
  sw: samplers.stopwatch.Sampler<T>,
  ...args: T
): Promise<void> {
  // Give jest reporters an opportunity to render when running in-band
  await delay(0);

  const result = await sw.run(...args);
  const matcherState = expect.getState();

  // throws if the result is an error
  Status.get(result);

  // report the sample
  onSample(matcherState, sw.sample());

  // Give jest an opportunity to render when running in-band
  return delay(0);
}

function createRunFn<T extends any[]>(fn: samplers.stopwatch.SamplerFn<T>) {
  const gc = getGC();
  const sample = new samples.duration.Duration(getSampleOptions());
  const sw = new samplers.stopwatch.Sampler(fn, [], getSamplerOptions(), sample, void 0, gc);

  return runStopwatch.bind(null, sw);
}

const _this = globalThis as any;

_this.bench = function (testName: string, fn: samplers.stopwatch.SamplerFn<[]>, timeout?: number) {
  return test(testName, createRunFn(fn), timeout);
};

_this.bench.only = function (
  testName: string,
  fn: samplers.stopwatch.SamplerFn<[]>,
  timeout?: number,
) {
  return test.only(testName, createRunFn(fn), timeout);
};

_this.bench.skip = function (
  testName: string,
  fn: samplers.stopwatch.SamplerFn<[]>,
  timeout?: number,
) {
  return test.skip(testName, createRunFn(fn), timeout);
};

_this.bench.each = function <T extends any[]>(cases: ReadonlyArray<T>) {
  const caseFn = test.each<T>(cases);

  return (name: string, fn: samplers.stopwatch.SamplerFn<T>, timeout?: number) =>
    caseFn(name, (...args) => createRunFn<T>(fn)(...args), timeout);
};

_this.bench.skip.each = function <T extends any[]>(cases: ReadonlyArray<T>) {
  const caseFn = test.each<T>(cases);

  return (name: string, fn: samplers.stopwatch.SamplerFn<T>, timeout?: number) =>
    caseFn(name, (...args) => createRunFn<T>(fn)(...args), timeout);
}

_this.bench.only.each = function <T extends any[]>(cases: ReadonlyArray<T>) {
  const caseFn = test.only.each<T>(cases);

  return (name: string, fn: samplers.stopwatch.SamplerFn<T>, timeout?: number) =>
    caseFn(name, (...args) => createRunFn<T>(fn)(...args), timeout);
};