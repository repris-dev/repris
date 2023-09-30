import { json, typeid, uuid } from '@repris/base';
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
  maxEffectSize: number;
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

/** Represents the consolidation of several independent samples of the same quantity */
export interface Conflator<T extends Sample<any>, Opts extends AnalysisOptions> {
  /** Return the result of the conflation */
  analyze(opts: Opts): ConflationResult<T>;
}

// todo: rename to Consolidation?
export interface ConflationResult<T extends Sample<V>, V = any>
  extends json.Serializable<wt.ConflationResult> {
  /** The kind of conflation result */
  readonly [typeid]: typeid;

  /** Unique identifier */
  readonly [uuid]: uuid;

  /** Samples ordered from 'best' to 'worst' depending on the method used. */
  stat(): { sample: T; status: ConflatedSampleStatus }[];

  /**
   * Effect size of the 'consistent' subset of samples. A lower effect size indicates
   * a more homogeneous subset
   */
  effectSize(): number;

  /** A sufficiently large consistent subset was found */
  ready(): boolean;

  /** Aggregate the homogeneous subset in to a single sample */
  values(): Iterable<V>;
}
