import { typeid } from '@sampleci/base';
import { Sample } from '../samples.js';

/** Represents the consolidation of several independent samples of the same quantity */
export interface Conflation<V>
{
  /** The kind of conflation */
  readonly [typeid]: typeid;

  /**
   * Get Samples constituting the conflation.
   * 
   * @param excludeOutliers If true, only the samples which meet
   * the inclusion criteria are returned; effectively the best samples.
   * If false, no outliers are excluded and all samples are returned.
   * Default: true
   */
  samples(excludeOutliers?: boolean): Iterable<Sample<V>>;
}
