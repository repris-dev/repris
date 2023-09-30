import chalk from 'chalk';
import { debug } from 'util';
import { lilconfig } from 'lilconfig';
import { assert, assignDeep, iterator, RecursivePartial, typeid } from '@repris/base';

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
    annotations: [{
      '@index': AnnotationRequest[],
      '@snapshot': AnnotationRequest[],
      '@test': AnnotationRequest[],
    }],
  }
}

export interface GradingThreshold {
  '>'?: number;
  '>='?: number;
  '=='?: number | string | boolean;
  '<='?: number;
  '<'?: number;

  apply: (str: string) => string;
};

export type Ctx = `@${string}`;

export interface GradingConfig {
  /** Annotation configuration */
  options?: Record<string, any>;

  /** Override the context to find the annotation value */
  ctx?: Ctx;

  /**
   * For annotations, the thresholds field is used to convert the
   * value in to a three-level grading.
   */
  rules?: GradingThreshold[];
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

/** A request for an annotation as either a typeid or a (typeid, config) tuple */
export type AnnotationRequest =
  string | [type: string, config: AnnotationConfig];

/** A tree of annotation requests where leaves are annotations and branches are context names */
export type AnnotationRequestTree =
  (AnnotationRequest | { [context: `@${string}`]: AnnotationRequestTree })[];

// prettier-ignore
const defaultConfig: SCIConfig = {
  sampler: {
    options: {},
  },

  sample: {
    options: {},
    annotations: [
      ['duration:iter', { displayName: 'N' }],
      ['mode:hsm', { displayName: 'Avg.' }],
      [
        'mode:hsm:ci-rme',
        {
          displayName: 'CI (95%)',
          grading: {
            rules: [
              { '>=': 0, apply: chalk.green },
              { '>=': 0.05, apply: chalk.yellow },
              { '>=': 0.2, apply: chalk.red },
            ],
          },
        },
      ],
    ] satisfies AnnotationRequestTree,
  },

  conflation: {
    options: {},
    annotations: [
      [
        'duration:conflation:summaryText',
        {
          displayName: 'Index',
          grading: [
            'conflation:ready',
            {
              rules: [{ '==': false, apply: chalk.dim }],
            },
          ],
        },
      ],
    ] satisfies AnnotationRequestTree,
  },

  comparison: {
    options: {},
    annotations: [{
      '@index': [
        ['mode:hsm:conflation',
        { displayName: 'Index (avg.)',
          grading: [
            'mode:hsm:hypothesis:significantDifference',
            {
              ctx: '@test',
              rules: [
                { apply: chalk.dim },
                { '<': 0, apply: chalk.reset }
              ],
            },
          ],
        }],
      ],
      '@test': [
        ['mode:hsm:hypothesis:summaryText', {
          displayName: 'Change (99% CI)',
          grading: [
            'mode:hsm:hypothesis:significantDifference',
            {
              rules: [
                { '==': 0, apply: chalk.dim },
                { '<': 0, apply: chalk.green },
                { '>': 0, apply: chalk.red }
              ],
            },
          ],
        }],
        ['mode:hsm:hypothesis:difference-ci', { display: false, options: { level: 0.95 } }],
      ],
      '@snapshot': [
        [
          'mode:hsm:conflation',
          {
            displayName: 'Snapshot (avg.)',
            grading: [
              'mode:hsm:hypothesis:significantDifference',
              {
                ctx: '@test',
                rules: [
                  { apply: chalk.dim },
                  { '>': 0, apply: chalk.reset }
                ],
              },
            ],
          },
        ],
      ],
    }],
  },
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

/**
 * @returns an iterator of all annotations which appear in the given
 * tree of annotations
 */
export function* iterateAnnotationTree(
  tree: AnnotationRequestTree,
  ctx?: Ctx[]
): IterableIterator<{ type: typeid, ctx?: Ctx[], options?: any }> {
  for (const branch of tree) {
    if (Array.isArray(branch) || typeof branch === 'string') {
      // leaf (annotation)
      const [type, cfg] = normalize.simpleOpt(branch, {});
      yield { type: type as typeid, options: cfg.options, ctx };
  
      if (cfg.grading) {
        const grading = cfg.grading;
        const [gType, gCfg] = Array.isArray(grading) ? grading : [type, grading];

        yield {
          type: gType as typeid,
          options: gCfg.options,
          ctx: gCfg.ctx ? [gCfg.ctx] : void 0,
        };    
      }
    } else {
      // branch (array of annotations within a context)
      for (const [prefix, child] of Object.entries(branch)) {
        if (prefix.startsWith('@')) {
          const ctxs: Ctx[] = ctx ? [...ctx, prefix as Ctx] : [prefix as Ctx];
          yield* iterateAnnotationTree(child, ctxs);
        }
      }
    }
  }
}

export function annotationRequester(
  annotations: AnnotationRequestTree,
): (context?: Ctx) => Map<typeid, any> {
  const requests = iterator.collect(iterateAnnotationTree(annotations));

  return (context?: Ctx) => {
    // TODO - Nested contexts
    assert.eq(Array.isArray(context), false, 'Nested Contexts not supported');
    const result = new Map<typeid, any>();
    
    requests.forEach(r => {
      if ((r.ctx === void 0 && context === void 0) || context === r.ctx?.[0]) {
        if (result.has(r.type) && result.get(r.type) !== r.options) {
          assert.is(false, 'Different configurations for the same annotation are not supported');
        }
        result.set(r.type, r.options);
      }
    })

    return result;
  }
}