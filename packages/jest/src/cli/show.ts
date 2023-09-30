import chalk from 'chalk';

import * as jestConfig from 'jest-config';
import { Config } from '@jest/types';
import * as core from '@jest/core';
import * as jReporters from '@jest/reporters';
import Runtime from 'jest-runtime';

import { snapshotManager, annotators, fixture as f } from '@repris/samplers';
import { iterator, uuid } from '@repris/base';

import { BaselineResolver } from '../snapshotUtils.js';
import { TableTreeReporter } from '../tableReport.js';
import * as reprisConfig from '../config.js';
import { gradedColumns } from '../reporterUtils.js';
import { println, panic } from './util.js';

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
  const annotationRequests = reprisConfig.parseAnnotations(reprisCfg.conflation.annotations)();
  const columns = gradedColumns(reprisCfg.conflation.annotations, void 0, 'show');
  const testRenderer = new TableTreeReporter<f.AggregatedFixture<any>>(columns, {
    annotate(fixture) {
      const conflation = fixture.conflation();
      if (conflation && fixture.annotations().has(conflation[uuid])) {
        const bag = annotators.DefaultBag.fromJson(
          fixture.annotations().get(conflation[uuid])!
        );

        annotators.annotateMissing(bag, annotationRequests, conflation);
        return bag;
      }
    },
    pathOf: fixture => fixture.name.title.slice(0, -1),
    render: fixture => chalk.dim(fixture.name.title.at(-1)),
  });

  for (const t of testFiles) {
    if (await sfm.exists(t.path)) {
      const [snapshot, err] = await sfm.loadOrCreate(t.path);

      if (err) panic(err);

      const path = jReporters.utils.formatTestPath(projCfg, t.path);
      println(path);

      const fixtures = iterator.collect(snapshot!.allFixtures(), []);
      testRenderer.render(fixtures, process.stderr);
    }
  }
}
