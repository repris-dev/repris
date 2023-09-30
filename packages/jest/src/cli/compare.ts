import { debug } from 'node:util';

import chalk from 'chalk';

import Runtime from 'jest-runtime';
import * as jestConfig from 'jest-config';
import type { Config } from '@jest/types';
import * as core from '@jest/core';
import * as jReporters from '@jest/reporters';

import {
  snapshotManager,
  annotators,
  snapshots,
  samples,
  wiretypes as wt,
  hypothesis,
  benchmark as b,
} from '@repris/samplers';
import { Status, iterator, typeid, uuid } from '@repris/base';

import { IndexResolver, BaselineResolver } from '../snapshotUtils.js';
import { TableTreeReporter } from '../tableReport.js';
import * as reprisConfig from '../config.js';
import { gradedColumns } from '../reporterUtils.js';
import { println, panic } from './util.js';

const dbg = debug('repris:cli');

export async function compare(_argv: string[]): Promise<void> {
  const cfg = await jestConfig.readConfigs({ $0: '', _: [] }, [process.cwd()]);
  const projCfg = cfg.configs[0];
  const context = await Runtime.default.createContext(projCfg, {
    maxWorkers: 1,
    watchman: false,
  });

  const baseline = new snapshotManager.SnapshotFileManager(await BaselineResolver(projCfg));
  const indexm = new snapshotManager.SnapshotFileManager(await IndexResolver(projCfg));
  const search = new core.SearchSource(context);
  const testFiles = (await search.getTestPaths(cfg.globalConfig)).tests;
  const reprisCfg = await reprisConfig.load(projCfg.rootDir);

  await showComparison(projCfg, reprisCfg, testFiles, indexm, baseline);
}

type ComparedBenchmarks = {
  name: wt.BenchmarkName;
  annotations: annotators.AnnotationBag;
};

async function showComparison(
  projCfg: Config.ProjectConfig,
  reprisCfg: reprisConfig.ReprisConfig,
  testFiles: jReporters.Test[],
  index: snapshotManager.SnapshotFileManager,
  baseline: snapshotManager.SnapshotFileManager
) {
  const annotationTree = reprisCfg.commands.compare?.annotations ?? [];
  const annotationRequests = reprisConfig.parseAnnotations(annotationTree);
  const columns = gradedColumns(annotationTree, void 0, 'compare');
  const testRenderer = new TableTreeReporter<ComparedBenchmarks>(columns, {
    annotate: comparison => comparison.annotations,
    pathOf: comparison => comparison.name.title.slice(0, -1),
    render: comparison => chalk.dim(comparison.name.title.at(-1)),
  });

  for (const t of testFiles) {
    if (!(await index.exists(t.path)) || !(await baseline.exists(t.path))) continue;

    const [snapIndex, err1] = await index.loadOrCreate(t.path);
    const [snapBaseline, err2] = await baseline.loadOrCreate(t.path);

    if (err1) panic(err1);
    if (err2) panic(err2);

    const path = jReporters.utils.formatTestPath(projCfg, t.path);
    println(path);

    const comparisons = iterator.map(
      snapshots.joinSnapshotBenchmarks(snapIndex!, snapBaseline!),
      ([index, base]) => annotateComparison(annotationRequests, index, base)
    );

    testRenderer.render(comparisons, process.stderr);
  }
}

function annotateComparison(
  annotationRequests: (context?: reprisConfig.Ctx) => Map<typeid, any>,
  index?: b.AggregatedBenchmark<samples.duration.Duration>,
  base?: b.AggregatedBenchmark<samples.duration.Duration>
): ComparedBenchmarks {
  const annotations = annotators.DefaultBag.from([]);

  // Load index conflation and annotations
  const x0 = index?.conflation();

  if (x0) {
    const bag = annotators.DefaultBag.fromJson(index?.annotations().get(x0[uuid]) ?? {});
    annotators.annotateMissing(bag, annotationRequests('@index'), x0);
    annotations.union(bag, '@index');
  }

  // Load snapshot conflation and annotations
  const x1 = base?.conflation();

  if (x1) {
    const bag = annotators.DefaultBag.fromJson(base?.annotations().get(x1[uuid]) ?? {});
    annotators.annotateMissing(bag, annotationRequests('@baseline'), x1);
    annotations.union(bag, '@baseline');
  }

  // run comparison
  if (x0 && x1) {
    const comparison = hypothesis.compare(x0, x1, annotationRequests('@test'));

    if (!Status.isErr(comparison)) {
      annotations.union(comparison[0].annotations, '@test');
    } else {
      dbg('Failed to compare conflations', comparison[1]);
    }
  }

  return {
    name: (index?.name ?? base?.name) as wt.BenchmarkName,
    annotations,
  };
}
