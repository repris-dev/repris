import { samplers } from '@repris/samplers';

declare namespace repris {
  interface It {
    /**
     * Create a repris benchmark with the given name 
     */
    (name: string, fn: samplers.stopwatch.SamplerFn<any>, timeout?: number): void;

    only: It;
  }
}

declare global {
  const bench: repris.It;
}

export {};
