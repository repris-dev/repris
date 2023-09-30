import { json, typeid, uuid, quantity as q } from '@repris/base';
import { Sample } from '../samples.js';
import * as wt from '../wireTypes.js';

export interface DigestOptions {
  /** Minimum number of samples in a valid digest */
  minSize: number;

  /**
   * The maximum number of samples to be included in the digest. The digest will
   * suggest which samples could be discarded by the benchmark when the trove
   * becomes too large.
   */
  maxSize: number;

  /**
   * Threshold for the digest to be considered valid, between
   * 0 (maximum similarity, no uncertainty) and 1 (completely dissimilar)
   * inclusive.
   */
  maxUncertainty: number;
}

export type DigestedSampleStatus =
  /**
   * A sample rejected due to limits on the maximum cache size. These
   * will be the 'worst' samples depending on the method used.
   */
  | 'rejected'
  /**
   * A sample not included in the digest because it differs significantly
   * from the rest of the digest
   */
  | 'outlier'
  /**
   * A sample which is sufficiently similar to be considered to
   * have been drawn from the same distribution.
   */
  | 'consistent';

/** A function to summarize a set of samples */
export type DigestMethod<T extends Sample<any>> = (
  samples: readonly T[],
  opts: DigestOptions
) => Digest<T>;

/** Represents the consolidation of several independent samples of the same quantity */
export interface Digest<T extends Sample<V>, V = any> extends json.Serializable<wt.BenchmarkDigest> {
  /** The kind of digest */
  readonly [typeid]: typeid;

  /** Unique identifier */
  readonly [uuid]: uuid;

  /** Samples ordered from 'best' to 'worst' depending on the method used. */
  stat(): readonly { sample: T; status: DigestedSampleStatus }[];

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

  /** A digest may be able to produce a sampling distribution */
  samplingDistribution?(): readonly number[];
}
