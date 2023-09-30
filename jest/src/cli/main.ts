import { Command } from 'commander';
import chalk from 'chalk';

import * as jestConfig from 'jest-config';
import { Config } from '@jest/types';
import * as core from '@jest/core';
import * as jReporters from '@jest/reporters';
import Runtime from 'jest-runtime';

import { snapshotManager, annotators } from '@sampleci/samplers';
import { typeid } from '@sampleci/base';
import { StagingAreaResolver } from '../snapshotUtils.js';
import { TableTreeReporter } from '../tableReport.js';
import { println, panic, yesNoQuestion } from './util.js';

export function run(argv: string[] = process.argv) {
  const program = new Command();

  program.name('repris').description('Repris CLI').version('0.8.0');

  program
    .command('reset')
    .description('Clear the contents of the repris index')
    .action(async (_options) => {
      reset(argv);
    });

  program.parse(argv);
}

type IndexFileStat = {
  testPath: string;
  fixtureCount: number;
  sampleCount: number;
  tombstoneCount: number;
};

async function reset(_argv: string[]) {
  const cfg = await jestConfig.readConfigs({ $0: '', _: [] }, [process.cwd()]);
  const projCfg = cfg.configs[0];
  const context = await Runtime.default.createContext(projCfg, {
    maxWorkers: 1,
    watchman: false,
  });

  const sfm = new snapshotManager.SnapshotFileManager(StagingAreaResolver(projCfg));

  // test paths
  const search = new core.SearchSource(context);
  const testFiles = (await search.getTestPaths(cfg.globalConfig)).tests;

  // print the index
  const indexStat = await showIndex(projCfg, testFiles, sfm);

  // Nothing to do if the index is empty
  if (indexStat.length === 0) {
    println('Index is empty.');
    return;
  }

  // ask permission
  const doDelete: boolean | undefined = await yesNoQuestion('Reset the index for these tests?');

  if (doDelete === true) {
    const p = indexStat.map((stat) => sfm.delete(stat.testPath));
    await Promise.all(p);

    println('Index reset');
  } else {
    println('Exiting.');
  }
}

async function showIndex(
  projCfg: Config.ProjectConfig,
  testFiles: jReporters.Test[],
  sfm: snapshotManager.SnapshotFileManager
): Promise<IndexFileStat[]> {
  const pending = [] as IndexFileStat[];

  for (const t of testFiles) {
    if (await sfm.exists(t.path)) {
      const [snapshot, err] = await sfm.loadOrCreate(t.path);

      if (err) panic(err);

      let fixtureCount = 0;
      let sampleCount = 0;
      let tombstoneCount = 0;

      for (const fixture of snapshot!.allFixtures()) {
        fixtureCount++;
        sampleCount += fixture.samples.length;
      }

      for (const _ of snapshot!.allTombstones()) {
        tombstoneCount++;
      }

      if (fixtureCount > 0 || tombstoneCount > 0) {
        pending.push({ testPath: t.path, fixtureCount, sampleCount, tombstoneCount });
      }
    }
  }

  if (pending.length === 0) {
    return pending;
  }

  const columns = [
    { id: 'fixtureStat' as typeid, displayName: 'Index (Benchmarks, samples)' },
    { id: 'tombstoneCount' as typeid, displayName: 'Snapshotted' },
  ];

  const report = new TableTreeReporter<IndexFileStat>(columns, {
    annotate: (stat) => {
      const ann = {
        fixtureStat:
          stat.fixtureCount === 0
            ? chalk.dim(`${stat.fixtureCount}, ${stat.sampleCount}`)
            : `${stat.fixtureCount}, ${stat.sampleCount}`,
        tombstoneCount: stat.tombstoneCount === 0 ? chalk.dim('0') : stat.tombstoneCount,
      };
      return annotators.DefaultBag.fromJson(ann);
    },
    render: (stat) => jReporters.utils.formatTestPath(projCfg, stat.testPath),
    pathOf: () => [],
  });

  report.render(pending, process.stderr);
  return pending;
}
