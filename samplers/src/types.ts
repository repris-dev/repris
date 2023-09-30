import type { Status } from '@sampleci/base';
import * as samples from './samples.js';

/**
 * A function to be sampled
 * @template O The Observation type
 * @template State The sampler state
 */
export interface SamplerFn<O, State extends SamplerState<O>, Args extends any[]> {
  (this: unknown, state: State, ...args: Args): void | PromiseLike<void>;
}

/** Used to build a Sample<V> */
export interface Sampler<V>
{
  /** build the sample */
  run(): Status | Promise<Status>;

  /** get the sample */
  sample(): samples.Sample<V>;
}

/** State accessible to a sampler function */
export interface SamplerState<O>
{
  [Symbol.iterator](): Iterator<any>;

  /** set the observation for the current iteration */
  set(observation: O): void;

  /** skip the current iteration */
  skip(): void;
}

/** A builder to configure a family of samplers */
export interface Builder<V, S extends Sampler<V>>
{
  /** Create the samplers */
  build(): S[];
}
