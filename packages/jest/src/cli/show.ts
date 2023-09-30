import { debug } from 'node:util';
import chalk from 'chalk';

import * as jestConfig from 'jest-config';
import { Config } from '@jest/types';
import * as core from '@jest/core';
import * as jReporters from '@jest/reporters';
import Runtime from 'jest-runtime';

import {
  snapshotManager,
  annotators,
  benchmark as b,
  wiretypes as wt,
  snapshots,
} from '@repris/samplers';
import { Status, iterator, typeid, uuid } from '@repris/base';

import { IndexResolver, BaselineResolver } from '../snapshotUtils.js';
import { TableTreeReporter } from '../tableReport.js';
import * as reprisConfig from '../config.js';
import { gradedColumns } from '../reporterUtils.js';
import { println, panic } from './util.js';

const dbg = debug('repris:show');

export async function show(_argv: string[]): Promise<void> {
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

  await showSnapshotDetail(projCfg, reprisCfg, testFiles, indexm, baseline);
}

type PairedBenchmarks = {
  name: wt.BenchmarkName;
  annotations: annotators.AnnotationBag;
};

async function showSnapshotDetail(
  projCfg: Config.ProjectConfig,
  reprisCfg: reprisConfig.ReprisConfig,
  testFiles: jReporters.Test[],
  index: snapshotManager.SnapshotFileManager,
  baseline: snapshotManager.SnapshotFileManager
) {
  const annotationTree = reprisCfg.commands.show?.annotations ?? [];
  const annotationReq = reprisConfig.parseAnnotations(annotationTree);

  const testRenderer = new TableTreeReporter<PairedBenchmarks>(
    gradedColumns(annotationTree, void 0, 'show'),
    {
      annotate: entry => entry.annotations,
      pathOf: entry => entry.name.title.slice(0, -1),
      render: entry => chalk.dim(entry.name.title.at(-1)),
    }
  );

  for (const t of testFiles) {
    const [snapBaseline, err1] = await baseline.loadOrCreate(t.path);
    const [snapIndex, err2] = await index.loadOrCreate(t.path);

    if (err1) panic(err1);
    if (err2) panic(err2);

    const path = jReporters.utils.formatTestPath(projCfg, t.path);
    println(path);

    const annotations = iterator.map(
      snapshots.joinSnapshotBenchmarks(snapIndex!, snapBaseline!),
      ([index, base]) => annotateTest(annotationReq, index, base)
    );

    testRenderer.render(annotations, process.stderr);
  }
}

function annotateTest(
  annotationRequests: (context?: reprisConfig.Ctx) => Map<typeid, any>,
  index?: b.AggregatedBenchmark<any>,
  base?: b.AggregatedBenchmark<any>
): PairedBenchmarks {
  const annotations = annotators.DefaultBag.from([]);

  index && annotateBenchmark(annotationRequests, index, annotations, '@index');
  base && annotateBenchmark(annotationRequests, base, annotations, '@baseline');

  return {
    name: (index?.name ?? base?.name) as wt.BenchmarkName,
    annotations,
  };
}

function annotateBenchmark(
  annotationRequests: (context?: reprisConfig.Ctx) => Map<typeid, any>,
  bench: b.AggregatedBenchmark<any>,
  annotations: annotators.DefaultBag,
  ctx: reprisConfig.Ctx
) {
  const req = annotationRequests(ctx);
  const digest = bench.digest();

  const benchBag = loadOrReannotate(bench, req, bench.annotations().get(bench[uuid]) ?? {});
  annotations.union(benchBag, ctx);

  if (digest) {
    const conflBag = loadOrReannotate(digest, req, bench.annotations().get(digest[uuid]) ?? {});
    annotations.union(conflBag, ctx);
  }
}

function loadOrReannotate<T extends annotators.Annotatable>(
  annotatable: T,
  annotationRequest: Map<typeid, any>,
  annotations: wt.AnnotationBag = {}
) {
  // Use existing annotations from the index
  const deserializedBag = annotators.DefaultBag.fromJson(annotations);

  // Compute missing annotations
  const stat = annotators.annotateMissing(deserializedBag, annotationRequest, annotatable);

  if (Status.isErr(stat)) {
    dbg('%s', stat[1]);
  }

  return deserializedBag;
}
