import { json, typeid, uuid, quantity as q } from '@repris/base';
import { Sample } from '../samples.js';
import * as wt from '../wireTypes.js';

export interface AnalysisOptions {
  /** The maximum number of samples in the cache */
  maxSize: number;

  /** Minimum number of samples in a valid conflation */
  minSize: number;

  /**
   * Threshold of similarity for the conflation to be considered valid, between
   * 0 (maximum similarity) and 1 (completely dissimilar) inclusive.
   */
  maxUncertainty: number;
}

export type ConflatedSampleStatus =
  /**
   * A sample rejected due to limits on the maximum cache size. These
   * will be the 'worst' samples depending on the method used.
   */
  | 'rejected'
  /**
   * A sample not included in the conflation because it differs significantly
   * from the rest of the conflation
   */
  | 'outlier'
  /**
   * A sample which is sufficiently similar to be considered to
   * have been drawn from the same distribution.
   */
  | 'consistent';

/** A function to conflate a set of samples */
export type Conflator<T extends Sample<any>> = (
  samples: readonly T[],
  opts: AnalysisOptions
) => Conflation<T>;

// todo: rename to Aggregation?
/** Represents the consolidation of several independent samples of the same quantity */
export interface Conflation<T extends Sample<V>, V = any> extends json.Serializable<wt.Conflation> {
  /** The kind of conflation result */
  readonly [typeid]: typeid;

  /** Unique identifier */
  readonly [uuid]: uuid;

  /** Samples ordered from 'best' to 'worst' depending on the method used. */
  stat(): readonly { sample: T; status: ConflatedSampleStatus }[];

  /**
   * A measure of the robustness of the 'consistent' subset, if any. An
   * uncertainty of zero means the samples are entirely heterogeneous
   * according to the analysis used.
   */
  uncertainty(): number;

  /** A sufficiently large consistent subset was found */
  ready(): boolean;

  /** Convert a sample value as a quantity */
  asQuantity(value: V): q.Quantity;

  /** A conflation may be able to produce a sampling distribution */
  samplingDistribution?(): readonly number[];
}
