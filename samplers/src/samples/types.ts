import { typeid, json } from '@sampleci/base';
import * as wt from '../wireTypes.js';

/**
 * A representation of a single random variable
 * @template V The Value type of the sample
 */
export interface Sample<V> extends json.Serializable<wt.SampleData>
{
  /** The kind of sample */
  readonly [typeid]: typeid;

  /** The number of values in the sample */
  count(): number;

  /** The values that constitute the sample */
  values(): IterableIterator<V>;
}

/**
 * The writeable of a sample
 * @template O The input Observation type
 * @template V The value type of the sample
 */
export interface MutableSample<O, V = O> extends Sample<V>
{
  /** Measure an observation and add zero or more values to the sample */
  push(observation: O): void;

  /** Remove all observations */
  reset(): void;
}
