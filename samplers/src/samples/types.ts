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
  sampleSize(): number;

  /**
   * @return The total number of observations.
   * 
   * Not all observations necessarily contribute to the sample and
   * so this number could be greater than the sample size.
   */
  observationCount(): number;

  /** The values that constitute the sample */
  values(): Iterable<V>;

  /**
   * @returns true if the sample is statistically significant for
   * its configured purpose
   */
  significant(): boolean;
}

/**
 * The writeable of a sample
 * @template O The input Observation type
 * @template V The value type of the sample
 */
export interface MutableSample<O, V = O> extends Sample<V>
{
  /**
   * Commit an observation to the sample, which creates one or more
   * sample values
   */
  push(observation: O): void;

  /** Remove all observations */
  reset(): void;
}

/** Represents the consolidation of several independent samples of the same quantity */
export interface Conflation<V>
{
  /** The kind of conflation */
  readonly [typeid]: typeid;

  /**
   * Samples constituting the conflation.
   *
   * @param maxSize When defined, only up to maxSize samples are returned. 
   * These should constitute the 'best' samples.
   * 
   * @param all If true, the returned iterable also includes any samples
   * that didn't meet the inclusion criteria for the conflation.
   * Default: false
   */
  samples(maxSize?: number, all?: boolean): Iterable<Sample<V>>;
}
