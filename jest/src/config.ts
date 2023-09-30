import { debug } from 'util';
import { lilconfig } from 'lilconfig';
import { assignDeep, RecursivePartial } from '@sampleci/base';

const dbg = debug('sci:config');

export interface SCIConfig {
  sampler: {
    /** Configuration of the sampler */
    options: RecursivePartial<import('@sampleci/samplers').stopwatch.Options>;
  };

  sample: {
    /** Configuration of each sample */
    options: RecursivePartial<import('@sampleci/samplers').samples.DurationOptions>;

    /** The annotations to compute for each sample */
    annotations: (string | [id: string, config: AnnotationConfig])[];
  };

  conflation: {
    /** Configuration of each conflation */
    options: RecursivePartial<import('@sampleci/samplers').conflations.DurationOptions>;

    /** The annotations to compute for each conflation */
    annotations: (string | [id: string, config: AnnotationConfig])[];
  };
}

export interface GradingConfig {
  /** Annotation configuration */
  options?: any;

  /**
   * For numeric annotations, the thresholds field is used to convert the
   * value in to a three-level grading.
   */
  thresholds?: number[];
}

export interface AnnotationConfig {
  display?: boolean;

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

const defaultConfig: SCIConfig = {
  sampler: {
    options: {},
  },

  sample: {
    options: {},
    annotations: [
      ['duration:iter', { displayName: 'N' }],
      ['duration:min', { displayName: 'min', display: false }],
      ['mode:hsm', { displayName: 'avg' }],
      [
        'mode:hsm:ci-rme',
        {
          displayName: 'ci',
          grading: {
            thresholds: [
              0, // >= good
              0.05, // >= ok
              0.1, // >= poor
            ],
          },
        },
      ],
    ],
  },

  conflation: {
    options: {},
    annotations: [
      ['mode:hsm:conflation', { displayName: 'avg¹' }],
      [
        'mode:hsm:conflation:ci-rme',
        {
          displayName: 'ci¹',
          grading: {
            thresholds: [
              0, // >= good
              0.05, // >= ok
              0.1, // >= poor
            ],
          },
        },
      ],
      ['duration:conflation:summaryText', { displayName: 'cache¹' }],
    ],
  },
};

/** Map of rootDir to config */
const sessionConfigs = new Map<string, SCIConfig>();

const loadEsm = async (filepath: string) => {
  try {
    dbg(`Loading (${filepath})`);
    const exports = await import(filepath);

    if (typeof exports.default === 'object') {
      return exports.default;
    } else {
      dbg("Config file doesn't have a valid default export");
    }
  } catch (e) {
    dbg('Failed to Load config file %s', e);
  }

  return {};
};

const explorer = lilconfig('sci', {
  loaders: {
    '.js': loadEsm,
    '.mjs': loadEsm,
  },
});

export async function load(rootDir: string): Promise<SCIConfig> {
  if (!sessionConfigs.has(rootDir)) {
    const searchResult = await explorer.search(rootDir);

    if (searchResult?.filepath) {
      const config = assignDeep(
        {},
        defaultConfig,
        !searchResult?.isEmpty ? searchResult?.config : {}
      );

      dbg(config);
      sessionConfigs.set(rootDir, config);
    } else dbg(`Config file Not found`);
  }

  return sessionConfigs.get(rootDir)!;
}
