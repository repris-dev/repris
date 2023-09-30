import { debug } from 'util';
import chalk from 'chalk';

import * as jestConfig from 'jest-config';
import { Config } from '@jest/types';
import * as core from '@jest/core';
import * as jReporters from '@jest/reporters';
import Runtime from 'jest-runtime';

import { snapshotManager, annotators, benchmark as b, wiretypes } from '@repris/samplers';
import { Status, iterator, typeid, uuid } from '@repris/base';

import { BaselineResolver } from '../snapshotUtils.js';
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
  const search = new core.SearchSource(context);
  const testFiles = (await search.getTestPaths(cfg.globalConfig)).tests;
  const reprisCfg = await reprisConfig.load(projCfg.rootDir);

  await showSnapshotDetail(projCfg, reprisCfg, testFiles, baseline);
}

async function showSnapshotDetail(
  projCfg: Config.ProjectConfig,
  reprisCfg: reprisConfig.ReprisConfig,
  testFiles: jReporters.Test[],
  sfm: snapshotManager.SnapshotFileManager
) {
  const annotationTree = reprisCfg.commands.show?.annotations ?? [];
  const annotationReq = reprisConfig.parseAnnotations(annotationTree);

  const testRenderer = new TableTreeReporter<b.AggregatedBenchmark<any>>(
    gradedColumns(annotationTree, void 0, 'show'), {
    annotate(benchmark) {
      const bag = annotators.DefaultBag.from([]);
      const conflation = benchmark.conflation();

      loadOrReannotate(
        benchmark,
        annotationReq('@baseline'),
        benchmark.annotations().get(benchmark[uuid]),
        bag,
        '@baseline'
      );

      if (conflation) {
        loadOrReannotate(
          conflation,
          annotationReq('@baseline'),
          benchmark.annotations().get(conflation[uuid]),
          bag,
          '@baseline'
        );
      }

      return bag;
    },
    pathOf: benchmark => benchmark.name.title.slice(0, -1),
    render: benchmark => chalk.dim(benchmark.name.title.at(-1)),
  });

  for (const t of testFiles) {
    if (await sfm.exists(t.path)) {
      const [snapshot, err] = await sfm.loadOrCreate(t.path);

      if (err) panic(err);

      const path = jReporters.utils.formatTestPath(projCfg, t.path);
      println(path);

      const benchmarks = iterator.collect(snapshot!.allBenchmarks(), []);
      testRenderer.render(benchmarks, process.stderr);
    }
  }
}

function loadOrReannotate<T extends annotators.Annotatable>(
  annotatable: T,
  annotationRequest: Map<typeid, any>,
  annotations: wiretypes.AnnotationBag = {},
  target: annotators.DefaultBag,
  ctx?: `@${string}`
) {
  // Use existing annotations from the index
  const deserializedBag = annotators.DefaultBag.fromJson(annotations);
  target.union(deserializedBag);
  
  // Compute missing annotations
  const result = annotators.annotateMissing(target, annotationRequest, annotatable, ctx);

  if (Status.isErr(result)) {
    dbg('%s', result[1]);
  }
}
