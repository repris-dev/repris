import { samplers } from '@repris/samplers';

declare namespace repris {
  interface Each {
    // Exclusively arrays.
    <T extends any[] | [any]>(
      cases: ReadonlyArray<T>,
    ): (name: string, fn: samplers.stopwatch.SamplerFn<T>, timeout?: number) => void;

    // Not arrays.
    <T>(
      cases: ReadonlyArray<T>,
    ): (name: string, fn: samplers.stopwatch.SamplerFn<[T]>, timeout?: number) => void;
  }

  interface It {
    /** Create a repris benchmark with the given name */
    (name: string, fn: samplers.stopwatch.SamplerFn<any>, timeout?: number): void;

    only: It;
    skip: It;
    each: Each;
  }
}

declare global {
  const bench: repris.It;
}

export {};
