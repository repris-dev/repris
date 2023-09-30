import { debug } from 'util';
import { lilconfig } from 'lilconfig';
import { assignDeep, RecursivePartial } from '@sampleci/base';
import type { samples, stopwatch } from '@sampleci/samplers';

const dbg = debug('sci:config');
const explorer = lilconfig('sci');

export interface AnnotationConfig {
  opts?: any;
  displayName?: string;
}

export interface SCIConfig {
  sampler: {
    options: stopwatch.Options;
  }

  sample: {
    options: samples.duration.SampleOptions;
    /** The annotations to create for each sample */
    annotations: (string | [id: string, config: AnnotationConfig])[];
  };

  conflation: {
    options: samples.duration.ConflationOptions;
    annotations: (string | [id: string, config: AnnotationConfig])[];
  };
}

const defaultConfig: RecursivePartial<SCIConfig> = {
  sampler: {
    options: {}
  },

  sample: {
    annotations: [
      ['duration:iter', { displayName: 'iter' }],
      ['duration:min', { displayName: 'min' }],
      ['hsm:conflation', { displayName: 'mode' }]
    ],
  },

  conflation: {
    annotations: [
      ['mode:hsm:conflation', { displayName: 'mode(*)' }]
    ],
  },
};

let sessionConfig: SCIConfig;

export async function load(rootDir: string): Promise<SCIConfig> {
  if (sessionConfig === void 0) {
    const searchResult = await explorer.search(rootDir);

    sessionConfig = assignDeep(
      {}, defaultConfig, !searchResult?.isEmpty ? searchResult?.config : {}
    );

    if (searchResult?.filepath)
      dbg(`Config file loaded (${ searchResult?.filepath })`);
    else
      dbg(`Config file Not found`);
  }

  return sessionConfig;
};
