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

export type ConflationResult = {
  /** The type of Conflation used */
  '@type': string;

  /** Identifier of this conflation result */
  '@uuid': uuid;

  /** The samples included in the conflation */
  samples: { '@ref': uuid, outlier: boolean }[];

  /** */
  effectSize: number;

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

  /** The observations(s) constituting the sample */
  data: SampleData;
};

export type AnnotationBag = Record<string, json.Value>;

export type FixtureName = {
  /** hierarchy of names for this fixture */
  title: string[];

  /** Uniquely identifies a fixture in a snapshot with the same title */
  nth: number;
};

export type Fixture = {
  '@type': string;

  /** Identifier */
  '@uuid': uuid;

  /**
   * The name of this fixture
   * Note: There can be multiple fixtures in a snapshot which have the same name.
   * Fixtures are therefore keyed on (name.title, name.nth).
   */
  name: FixtureName;

  /**
   * The total number of runs of this fixture, which can be more
   * than the number of samples.
   */
  totalRuns: number;

  /** All collected samples */
  samples: Sample[];

  /** Conflation of the samples */
  conflation?: ConflationResult;

  /** Index of annotations of samples/conflations in this fixture */
  annotations?: Record<string, AnnotationBag>;
};

export type Epoch = {
  startTime: string;
  endTime: string;
};

/** A collection of results of one or more runs of a test suite in a particular epoch */
export type Snapshot = {
  /** All fixtures collected over multiple runs. */
  fixtures: Fixture[];

  /**
   * Fixture titles in this cache which have been deleted. For example the fixture
   * associated with that title has been moved elsewhere.
   */
  tombstones?: FixtureName[];

  /** */
  epoch?: Epoch;
};

export function isSample(x: Sample): x is Sample {
  return typeof x === 'object'
      && typeof x.samplerInfo !== 'undefined'
      && typeof x.data === 'object'
      && typeof x.data['@type'] === 'string';
}
