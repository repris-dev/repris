import { debug } from 'util';
import { lilconfig } from 'lilconfig';
import { assert, assignDeep, iterator, typeid } from '@repris/base';

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

    /** The annotations to compute for each sample */
    annotations: AnnotationRequest[];
  };

  conflation: {
    /** Configuration of each conflation */
    options: import('@repris/samplers').conflations.duration.Options;

    /** The annotations to compute for each conflation */
    annotations: AnnotationRequest[];
  };

  benchmark: {
    /** The annotations to compute for each conflation */
    annotations: AnnotationRequest[];
  };

  comparison: {
    /**
     * The annotations to compute for each conflation. In a conflation,
     * 3 items are annotatable and the annotations for each can be configured
     * separately based on the corresponding context:
     * 
     *  1. '@index' - The annotations for the conflation stored in the index
     *  2. '@baseline' - The annotations for the baseline conflation
     *  3. '@test' - The annotations for the hypothesis test 
     */
    annotations: AnnotationRequestTree<'@index' | '@baseline' | '@test'>
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
  display?: boolean | { if: string[] };

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
export type AnnotationRequestTree<T extends `@${string}` = `@${string}`> =
  (AnnotationRequest | Record<T, AnnotationRequestTree>)[];

export const normalize = {
  simpleOpt<T>(opt: string | [id: string, opt: T], defaultOpt: T): [id: string, opt: T] {
    return typeof opt === 'string' ? [opt, defaultOpt] : opt;
  }
}

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

const defaultConfig: Promise<ReprisConfig> = import(DEFAULT_CONFIG_PATH)
  .then(mod => mod.default)
  .catch((e) => {
    dbg(`Failed to load default Config file (%s): %s`, DEFAULT_CONFIG_PATH, e);
  });

/** Map of rootDir to config */
const sessionConfigs = new Map<string, ReprisConfig>();

export async function load(rootDir: string): Promise<ReprisConfig> {
  if (!sessionConfigs.has(rootDir)) {
    const sr = await explorer.search(rootDir);
    const defaultCfg = await defaultConfig;

    if (sr?.filepath) {
      const config = assignDeep<ReprisConfig>(
        {},
        defaultCfg,
        !sr?.isEmpty ? sr?.config : {}
      );

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
 * tree of annotations
 */
export function* iterateAnnotationTree(
  tree: AnnotationRequestTree,
  ctx?: Ctx[]
): IterableIterator<{ type: typeid, ctx?: Ctx[], if?: string[], options?: any }> {
  for (const branch of tree) {
    if (Array.isArray(branch) || typeof branch === 'string') {
      // leaf (annotation)
      const [type, cfg] = normalize.simpleOpt(branch, {});
      yield {
        type: type as typeid,
        options: cfg.options,
        ctx,
      };
  
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

/**
 * @returns A function which creates annotation requests derived from
 * the given configuration.
 */
export function parseAnnotations(
  annotations: AnnotationRequestTree,
): (context?: Ctx) => Map<typeid, any> {
  const requests = iterator.collect(iterateAnnotationTree(annotations));

  return (context?: Ctx) => {
    assert.eq(Array.isArray(context), false, 'Nested Contexts not supported');
    const result = new Map<typeid, any>();
    
    requests.forEach(r => {
      if ((r.ctx === void 0 && context === void 0) || context === r.ctx?.[0]) {
        if (result.has(r.type) && result.get(r.type) !== r.options) {
          assert.is(false, 'Different configurations for the same annotation are not supported');
        }

        result.set(r.type, r.options);
      }
    });

    return result;
  }
}