import { samplers } from '@repris/samplers';

declare global {
  function sample<Args extends any[]>(
    name: string,
    fn: samplers.stopwatch.SamplerFn<Args>,
    timeout?: number,
  ): void;
}

export {};
