import { debug } from 'util';

import chalk from 'chalk';

import * as jestConfig from 'jest-config';
import { Config } from '@jest/types';
import * as core from '@jest/core';
import * as jReporters from '@jest/reporters';
import Runtime from 'jest-runtime';

import {
  snapshotManager,
  annotators,
  snapshots,
  samples,
  wiretypes as wt,
  hypothesis,
  conflations,
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

type ComparedFixtures = {
  name: wt.FixtureName;
  annotations: annotators.AnnotationBag;
};

async function showComparison(
  projCfg: Config.ProjectConfig,
  reprisCfg: reprisConfig.ReprisConfig,
  testFiles: jReporters.Test[],
  index: snapshotManager.SnapshotFileManager,
  baseline: snapshotManager.SnapshotFileManager
) {
  const annotationRequests = reprisConfig.parseAnnotations(reprisCfg.comparison.annotations);
  const columns = gradedColumns(reprisCfg.comparison.annotations, void 0, 'compare');
  const testRenderer = new TableTreeReporter<ComparedFixtures>(columns, {
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
      snapshots.joinSnapshotFixtures(snapIndex!, snapBaseline!),
      ([index, base]) => annotateComparison(annotationRequests, index, base)
    );

    testRenderer.render(comparisons, process.stderr);
  }
}
function annotateComparison(
  annotationRequests: (context?: reprisConfig.Ctx) => Map<typeid, any>,
  index?: snapshots.AggregatedFixture<samples.Duration>,
  base?: snapshots.AggregatedFixture<samples.Duration>
): { name: wt.FixtureName; annotations: annotators.DefaultBag } {
  const annotations = annotators.DefaultBag.from([]);

  // Load index conflation and annotations
  const x0 = index ? tryLoadConflation(index) : void 0;
  
  if (x0) {
    const bag = annotators.DefaultBag.fromJson(index?.conflation?.annotations ?? {});
    annotators.annotateMissing(bag, annotationRequests('@index'), x0);
    annotations.union(bag, '@index');
  }

  // Load snapshot conflation and annotations
  const x1 = base ? tryLoadConflation(base) : void 0;

  if (x1) {
    const bag = annotators.DefaultBag.fromJson(index?.conflation?.annotations ?? {});
    annotators.annotateMissing(bag, annotationRequests('@snapshot'), x1);
    annotations.union(bag, '@snapshot');
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
    name: (index?.name ?? base?.name) as wt.FixtureName,
    annotations,
  };
}

function tryLoadConflation(
  fixture: snapshots.AggregatedFixture<samples.Duration>
): conflations.DurationResult | undefined {
  if (!fixture.conflation) return;

  const result = conflations.DurationResult.fromJson(
    fixture.conflation.result,
    new Map(iterator.map(fixture.samples, ({ sample }) => [sample[uuid], sample]))
  );

  if (Status.isErr(result)) {
    dbg('Failed to load conflation', Status.get(result));
  } else {
    return Status.get(result);
  }
}
