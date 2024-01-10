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

  /** The location estimation statistic to create a sampling distribution from */
  locationEstimationType: typeid;

  /**
   * The threshold for a digest to be considered for snapshotting.
   * The value should be the smallest difference (in proportion to the mean)
   * that you are interested in.
   *
   * A smaller threshold would mean smaller changes could be reliably detected, but
   * more runs will be needed and even then, some benchmarks might not be sufficiently
   * reliable to meet the threshold for the maximum sample size (maxSize).
   */
  minEffectSize: number;
}

export type DigestedSampleStatus =
  /**
   * A sample rejected due to limits on the maximum digest size.
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
  opts: DigestOptions,
) => Digest<T>;

/** Represents the consolidation of several independent samples of the same quantity */
export interface Digest<T extends Sample<V>, V = any>
  extends json.Serializable<wt.BenchmarkDigest> {
  /** The kind of digest */
  readonly [typeid]: typeid;

  /** Unique identifier */
  readonly [uuid]: uuid;

  /** Samples ordered from 'best' to 'worst' depending on the method used. */
  stat(): readonly { sample: T; status: DigestedSampleStatus }[];

  /**
   * The minimum detectable effect-size (MDES) of the digest.
   * A smaller MDES is needed to reliably detect smaller differences
   * in a difference test.
   */
  mdes(): number;

  /** The digest is sufficiently large and its MDE is sufficiently small */
  ready(): boolean;

  /** Convert a sample value as a quantity */
  asQuantity(value: V): q.Quantity;

  /** A digest may be able to produce a sampling distribution */
  samplingDistribution?(): readonly number[];
}
