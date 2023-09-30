import { json, typeid, uuid } from '@repris/base';

export type Parameter =
    number | string | boolean | { label: string, value: json.Value };

export type SamplerInfo = json.Value & {
  '@type': string;

  parameter?: Parameter[]
};

// TODO - rename to Sample?
export type SampleData = json.Value & {
  '@type': string;

  /** Identifier */
  '@uuid': uuid;
};

// TODO - rename to Aggregate?
export type Conflation = {
  /** The type of Conflation used */
  '@type': string;

  /** Identifier of this conflation result */
  '@uuid': uuid;

  /** The samples included in the conflation */
  samples: { '@ref': uuid; outlier: boolean }[];

  statistic: json.Value;

  /** */
  uncertainty: number;

  /** */
  isReady: boolean;
};

// TODO - rename to Sampler?
export type Sample = {
  /**
   * The configuration of the sampler used to create this sample. Usually to be
   * able to compare or combine two samples the sample configuration must be
   * identical.
   */
  samplerInfo?: SamplerInfo;

  /** The observations(s) of the sample */
  data: SampleData;
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

  /** All collected samples */
  samples: Sample[];

  /** Conflation of the samples */
  conflation?: Conflation;

  /** Index of annotations of samples/conflation in this benchmark */
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
