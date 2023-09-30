import { json, typeid, uuid } from '@repris/base';

export type Parameter =
    number | string | boolean | { label: string, value: json.Value };

export type Sample = json.Value & {
  '@type': string;

  /** Identifier */
  '@uuid': uuid;
};

export type BenchmarkDigest = {
  /** The type of digest this is */
  '@type': string;

  /** Identifier */
  '@uuid': uuid;

  /** The samples included in the digest and their classification  */
  samples: { '@ref': uuid; outlier: boolean }[];

  /** The annotated statistic produced by the digest */
  statistic: json.Value;

  /** The digests own measure of confidence in the statistic it generated */
  uncertainty: number;

  /** */
  isReady: boolean;
};

export type SamplerInfo = json.Value & {
  '@type': string;

  parameter?: Parameter[]
};

export type Sampler = {
  /**
   * The configuration of the sampler used to create this sample. Usually to be
   * able to compare or combine two samples the sample configuration must be
   * identical.
   */
  config?: SamplerInfo;

  /** The run number of the benchmark which created this sample */
  run?: number;

  /** The sample this sampler created */
  sample: Sample;
};

export type AnnotationBag = Record<string, json.Value>;

export type BenchmarkName = {
  /** hierarchy of names for this benchmark */
  title: string[];

  /** Uniquely identifies a benchmark in a snapshot with the same title */
  nth: number;
};

export type Benchmark = {
  '@type': string;

  /** Identifier */
  '@uuid': uuid;

  /** The name of this benchmark */
  name: BenchmarkName;

  /**
   * The total number of runs of this benchmark, which can be more
   * than the number of samples.
   */
  totalRuns: number;

  /** All collected sampler configurations and samples */
  trove: Sampler[];

  /** Summary of the samples in the trove */
  digest?: BenchmarkDigest;

  /** Index of all annotations in this benchmark */
  annotations?: Record<string, AnnotationBag>;
};

export type Epoch = {
  startTime: string;
  endTime: string;
};

/** A collection of results of one or more runs of a test suite in a particular epoch */
export type Snapshot = {
  /** All benchmarks collected over multiple runs. */
  benchmarks: Benchmark[];

  /**
   * benchmark titles in this cache which have been deleted. For example the benchmark
   * associated with that title has been moved elsewhere.
   */
  tombstones?: BenchmarkName[];

  /** */
  epoch?: Epoch;
};
