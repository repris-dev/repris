import { debug } from 'node:util';
import { lilconfig } from 'lilconfig';
import { assert, assignDeep, iterator, lazy, typeid, quantity as q } from '@repris/base';
import { annotators } from '@repris/samplers';

const dbg = debug('repris:config');
const DEFAULT_CONFIG_PATH = '../.reprisrc.defaults.js';

export interface ReprisConfig {
  sampler: {
    /** Configuration of the sampler */
    options: import('@repris/samplers').samplers.stopwatch.Options;
  };

  sample: {
    /** Configuration of each sample */
    options: import('@repris/samplers').samples.duration.Options;
  };

  digest: {
    /** Configuration of each digest */
    options: import('@repris/samplers').digests.duration.Options;
  };

  commands: {
    compare?: {
      /**
       * The annotations to compute for each digest. In a digest,
       * 3 items are annotatable and the annotations for each can be configured
       * separately based on the corresponding context:
       *
       *  1. '@index' - The annotations for the digest stored in the index
       *  2. '@baseline' - The annotations for the baseline digest
       *  3. '@test' - The annotations for the hypothesis test
       */
      annotations: AnnotationRequestTree<'@index' | '@baseline' | '@test'>;
    };
    show?: {
      annotations: AnnotationRequestTree<'@index' | '@baseline'>;
    };
    test?: {
      annotations: AnnotationRequest[];
    };
  };
}

export type Ctx = `@${string}`;

export interface GradingThreshold extends annotators.Condition {
  apply: (str: string) => string;
}

export interface GradingConfig {
  /** Annotation configuration */
  options?: Record<string, any>;

  /** Override the context to find the annotation value */
  ctx?: Ctx;

  /**
   * For annotations, the thresholds field is used to convert the
   * value in to a grading.
   */
  rules?: GradingThreshold[];
}

export interface BrandingConfig {
  with: typeid;
  when: annotators.Condition;
}

export interface AnnotationConfig {
  /** Optionally show the annotation from the UI (default: true) */
  display?: boolean | { if: string[] };

  /** The title to display in reports */
  displayName?: string;

  /** default ANSI styling to apply */
  style?: (str: string) => string;

  /** Configuration of the annotation */
  options?: Record<string, any>;

  /**
   * A grading can be configured to annotate the 'quality' of an annotation.
   * The grading is used by reporters to style the statistic.
   *
   * For example, the mean value of a sample could be graded using
   * the coefficient of variance as a proxy for the 'noisiness' of the sample.
   */
  grading?: [id: string, config: GradingConfig] | GradingConfig;

  gradings?: ([id: string, config: GradingConfig] | GradingConfig)[];

  brand?: BrandingConfig;
}

/** A request for an annotation as either a typeid or a (typeid, config) tuple */
export type AnnotationRequest = string | [type: string, config: AnnotationConfig];

/** A tree of annotation requests where leaves are annotations and branches are context names */
export type AnnotationRequestTree<T extends `@${string}` = `@${string}`> = (
  | AnnotationRequest
  | Record<T, AnnotationRequestTree>
)[];

export const normalize = {
  simpleOpt<T>(opt: string | [id: string, opt: T], defaultOpt: T): [id: string, opt: T] {
    return typeof opt === 'string' ? [opt, defaultOpt] : opt;
  },
};

const loadEsm = async (filepath: string) => {
  try {
    dbg('Loading (%s)', filepath);
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

const defaultConfig = lazy(() =>
  import(DEFAULT_CONFIG_PATH)
    .then(mod => mod.default as ReprisConfig)
    .catch(e => {
      dbg(`Failed to load default Config file (%s): %s`, DEFAULT_CONFIG_PATH, e);
      return {} as ReprisConfig;
    }),
);

/** Map of rootDir to config */
const sessionConfigs = new Map<string, ReprisConfig>();

export async function load(rootDir: string): Promise<ReprisConfig> {
  if (!sessionConfigs.has(rootDir)) {
    const [sr, defaultCfg] = await Promise.all([explorer.search(rootDir), defaultConfig()]);

    if (sr?.filepath) {
      const config = assignDeep<ReprisConfig>({}, defaultCfg, !sr?.isEmpty ? sr?.config : {});

      dbg('%s', config);
      sessionConfigs.set(rootDir, config);
    } else {
      dbg(`Config file Not found`);
      sessionConfigs.set(rootDir, defaultCfg);
    }
  }

  return sessionConfigs.get(rootDir)!;
}

/**
 * @returns an iterator of all annotations which appear in the given
 * annotation request tree
 */
export function* iterateAnnotationTree(
  tree: AnnotationRequestTree,
  ctx?: Ctx[],
): IterableIterator<{ type: typeid; ctx?: Ctx[]; if?: string[]; options?: any }> {
  for (const branch of tree) {
    if (Array.isArray(branch) || typeof branch === 'string') {
      // leaf (annotation)
      const [type, cfg] = normalize.simpleOpt(branch, {});

      yield {
        type: type as typeid,
        options: cfg.options,
        ctx,
      };

      const gradings = cfg.grading ? [cfg.grading] : (cfg.gradings ?? []);

      for (const grading of gradings) {
        const [gType, gCfg] = Array.isArray(grading) ? grading : [type, grading];

        yield {
          type: gType as typeid,
          options: gCfg.options,
          ctx: gCfg.ctx ? [gCfg.ctx] : ctx,
        };
      }

      if (cfg.brand) {
        const brand = cfg.brand;
        const [, e] = annotators.registerBranding(brand.with, type as typeid, brand.when);

        if (e) {
          dbg(`Branding could not be registered. "%s"`, e);
        } else {
          yield {
            type: brand.with,
          };
        }
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

/**
 * @returns A function which creates annotation requests derived from
 * the given configuration.
 */
export function parseAnnotations(
  annotationRequests: AnnotationRequestTree = [],
): (context?: Ctx) => Map<typeid, any> {
  const requests = iterator.collect(iterateAnnotationTree(annotationRequests));

  return (context?: Ctx) => {
    assert.eq(Array.isArray(context), false, 'Nested Contexts not supported');
    const result = new Map<typeid, any>();

    requests.forEach(r => {
      if ((r.ctx === void 0 && context === void 0) || context === r.ctx?.[0]) {
        const newOpts = r.options;

        if (result.has(r.type)) {
          const oldOpts = result.get(r.type);

          if (newOpts !== oldOpts) {
            dbg(`(Warning) Annotation (${ r.type }) is defined multiple times with different configurations.\n`);
            if (newOpts === void 0) {
              // explicit options take precedence
              return; 
            }
          }
        }

        result.set(r.type, newOpts);
      }
    });

    return result;
  };
}
