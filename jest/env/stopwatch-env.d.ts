import { stopwatch } from '@sampleci/samplers';

declare global {
  function sample<Args extends any[]>(
    name: string,
    fn: stopwatch.SamplerFn<Args>,
    timeout?: number,
  ): void;
}

export {};
