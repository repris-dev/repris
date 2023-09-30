import { debug } from 'util';
import { lilconfig } from 'lilconfig';
import { assignDeep, RecursivePartial } from '@repris/base';

const dbg = debug('repris:config');

export interface SCIConfig {
  sampler: {
    /** Configuration of the sampler */
    options: RecursivePartial<import('@repris/samplers').stopwatch.Options>;
  };

  sample: {
    /** Configuration of each sample */
    options: RecursivePartial<import('@repris/samplers').samples.DurationOptions>;

    /** The annotations to compute for each sample */
    annotations: AnnotationRequest[];
  };

  conflation: {
    /** Configuration of each conflation */
    options: RecursivePartial<import('@repris/samplers').conflations.DurationOptions>;

    /** The annotations to compute for each conflation */
    annotations: AnnotationRequest[];
  };

  comparison: {
    options: unknown,

    /** The annotations to compute for each conflation */
    annotations: {
      '@index': AnnotationRequest[],
      '@snapshot': AnnotationRequest[],
      '@test': AnnotationRequest[],
    }
  }
}

export interface GradingConfig {
  /** Annotation configuration */
  options?: Record<string, any>;

  /**
   * For numeric annotations, the thresholds field is used to convert the
   * value in to a three-level grading.
   */
  thresholds?: number[];
}

export interface AnnotationConfig {
  /** Optionally show the annotation from the UI (default: true) */
  display?: boolean;

  /** The title to display in reports */
  displayName?: string;

  /** Configuration of the annotation */
  options?: Record<string, any>;

  /**
   * A grading can be configured to annotate the 'quality' of an annotation.
   * The grading of an annotation is used by reporters to color the statistic.
   *
   * For example, the mean value of a sample could be graded using
   * the coefficient of variance as a proxy for the 'noisiness' of the sample.
   */
  grading?: [id: string, config: GradingConfig] | GradingConfig;
}

export type AnnotationRequest = string | [type: string, config: AnnotationConfig];

export type NestedAnnotationRequest =
  { [context: `@${string}`]: (NestedAnnotationRequest | AnnotationRequest)[] } | AnnotationRequest[];

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
    ] satisfies NestedAnnotationRequest,
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
      ['duration:conflation:summaryText', { displayName: 'index¹' }],
    ] satisfies NestedAnnotationRequest,
  },

  comparison: {
    options: {},
    annotations: {
      '@index': [['mode:hsm:conflation', { displayName: 'avg (index)' }]  ],
      '@test': [
        ['mode:hsm:hypothesis:summaryText', { displayName: 'change (95% CI)' }],
        ['mode:hsm:hypothesis:difference-ci', { display: false, options: { level: 0.95 } }]
      ],
      '@snapshot': [['mode:hsm:conflation', { displayName: 'avg (snapshot)' }]],
    } satisfies NestedAnnotationRequest
  }
};

export const normalize = {
  simpleOpt<T>(opt: string | [id: string, opt: T], defaultOpt: T): [id: string, opt: T] {
    return typeof opt === 'string' ? [opt, defaultOpt] : opt;
  }
}

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

const explorer = lilconfig('repris', {
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
