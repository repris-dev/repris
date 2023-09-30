import { debug } from 'util';
import { lilconfig } from 'lilconfig';
import { assignDeep, RecursivePartial } from '@sampleci/base';

const dbg = debug('sci:config');

export interface SCIConfig
{
  sampler: {
    /** Configuration of the sampler */
    options: import('@sampleci/samplers').stopwatch.Options;
  }

  sample: {
    /** Configuration of each sample */
    options: import('@sampleci/samplers').samples.duration.SampleOptions;
    
    /** The annotations to compute for each sample */
    annotations: (string | [id: string, config: AnnotationConfig])[];
  };

  conflation: {
    /** Configuration of each conflation */
    options: import('@sampleci/samplers').samples.duration.ConflationOptions;
    
    /** The annotations to compute for each conflation */
    annotations: (string | [id: string, config: AnnotationConfig])[];
  };
}

export interface GradingConfig
{
  /** Annotation configuration */
  options?: any;

  /**
   * For numeric annotations, the thresholds field is used to convert the
   * value in to a three-level grading.
   */
  thresholds?: number[];
}

export interface AnnotationConfig
{
  /** The title to display in reports */
  displayName?: string;

  /** Configuration of the annotation */
  options?: any;

  /**
   * A grading can be configured to annotate the 'quality' of an annotation.
   * The grading of an annotation is used by reporters to color the statistic.
   * 
   * For example, the mean value of a sample could be graded using
   * the coefficient of variance as a proxy for the 'noisiness' of the sample.
   */
  grading?: [id: string, config: GradingConfig] | GradingConfig;
}


const defaultConfig: RecursivePartial<SCIConfig> = {
  sample: {
    annotations: [
      ['duration:iter', { displayName: 'iter' }],
      ['duration:min', { displayName: 'min' }],
      ['mode:hsm', { displayName: 'mode' }],
      ['mode:hsm:ci-rme', {
        displayName: 'ci',
        grading: {
          thresholds: [
            0,    // >= good
            0.05, // >= ok
            0.1,  // >= poor
          ],
        }
      }]
    ],
  },

  conflation: {
    annotations: [
      ['mode:hsm:conflation', { displayName: 'mode(*)' }],
      ['mode:hsm:conflation:ci-rme', {
        displayName: 'ci(*)',
        grading: {
          thresholds: [
            0,    // >= good
            0.05, // >= ok
            0.1,  // >= poor
          ],
        }
      }]
    ],
  },
};

/** Map of rootDir to config */
const sessionConfigs = new Map<string, SCIConfig>();

const loadEsm = (filepath: string) => import(filepath);
const explorer = lilconfig('sci', {
  loaders: {
    '.js': loadEsm,
    '.mjs': loadEsm,
  }
});

export async function load(rootDir: string): Promise<SCIConfig> {
  if (!sessionConfigs.has(rootDir)) {
    const searchResult = await explorer.search(rootDir);

    sessionConfigs.set(rootDir, assignDeep(
      {}, defaultConfig, !searchResult?.isEmpty ? searchResult?.config : {}
    ));

    if (searchResult?.filepath)
      dbg(`Config file loaded (${ searchResult?.filepath })`);
    else
      dbg(`Config file Not found`);
  }

  return sessionConfigs.get(rootDir)!;
};
