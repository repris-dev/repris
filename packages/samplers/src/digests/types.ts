import { json, typeid, uuid, quantity as q } from '@repris/base';
import { Sample } from '../samples.js';
import * as wt from '../wireTypes.js';

export interface DigestOptions {
  /**
   * The maximum number of samples to be included in the digest. The digest will
   * suggest which samples could be discarded by the benchmark when the trove
   * becomes too large.
   */
  maxSize: number;

  /** 
   * The location estimation statistic of each sample to create a sampling distribution
   * from, e.g. median, mean.
   */
  locationEstimationType: typeid;

  /** Maximum assumed precision of observations in each sample. */
  maxPrecision: number;
}

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
  stat(): readonly { sample: T; rejected?: boolean }[];

  /**
   * A measure of the digest's sampling distribution's divergence from a normal distribution.
   * A value of 1 indicates perfect normality (more exactly, no evidence against the null
   * hypothesis that the sampling distribution is normal), 0 indicates a non-normal
   * distribution.
   */
  normality(): number;

  /** Convert a sample value as a quantity */
  asQuantity(value: V): q.Quantity;

  /** A digest may be able to produce a sampling distribution */
  samplingDistribution?(): readonly number[];
}
