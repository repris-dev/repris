import { json } from '@sampleci/base';

export type Parameter =
    number | string | boolean | { label: string, value: json.Value };

export type SamplerInfo = json.Value & {
  '@type': string;
  variable: { name: string };
  parameters?: Parameter[]
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
  metadata: SamplerInfo;

  /** The observations constituting the sample */
  sample: SampleData;
};

export type FixtureName = {
  title: string[];
  description?: string;
  version?: string;
};

export type Report = {
  fixtures: {
    name: FixtureName;
    samples: Sample[];
  }[]
};

export type Epoch = string;

export function isSample(x: Sample): x is Sample {
  return typeof x === 'object'
      && typeof x.metadata !== 'undefined'
      && typeof x.sample === 'object'
      && typeof x.sample['@type'] === 'string';
}
