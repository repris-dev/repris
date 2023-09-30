import { json, typeid } from '@sampleci/base';

export type Parameter =
    number | string | boolean | { label: string, value: json.Value };

export type SamplerInfo = json.Value & {
  '@type': string;
  parameter?: Parameter[]
};

export type SampleData = json.Value & {
  '@type': string
};

export type Sample = {
  /**
   * The configuration of the sampler used to create this sample. Usually to be
   * able to compare or combine two samples the sample configuration must be
   * identical.
   */
  samplerInfo?: SamplerInfo;

  /** The observations(s) constituting the sample */
  data: SampleData;

  /** Annotations of the sample */
  annotations?: AnnotationBag;
};

export type AnnotationBag = Record<string, json.Value>;

export type FixtureName = {
  title: string[];
  nth: number;
  description?: string;
  version?: string;
};

export type Fixture = {
  /**
   * The name of this fixture
   * Note: There can be multiple fixtures in a report which have the same name.
   * Fixtures are therefore keyed on (name.title, name.nth).
   */
  name: FixtureName;

  /** All collected samples */
  samples: Sample[];

  /** Conflation of the samples */
  conflation?: SampleConflation
};

export type Epoch = {
  startTime: string;
  endTime: string;
};

export type SampleConflation = {
  '@type': string;
  annotations: AnnotationBag;
}

export type Report = {
  epoch: Epoch;
  fixtures: Fixture[];
};

export function isSample(x: Sample): x is Sample {
  return typeof x === 'object'
      && typeof x.samplerInfo !== 'undefined'
      && typeof x.data === 'object'
      && typeof x.data['@type'] === 'string';
}
