import { Command } from 'commander';
import chalk from 'chalk';

import * as jestConfig from 'jest-config';
import { Config } from '@jest/types';
import * as core from '@jest/core';
import * as jReporters from '@jest/reporters';
import Runtime from 'jest-runtime';

import { snapshotManager, annotators } from '@repris/samplers';
import { typeid } from '@repris/base';
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

type IndexStat = {
  totalFixtures: number;
  totalSamples: number;
  files: IndexFileStat[];
};

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
  if (indexStat.files.length === 0) {
    println('Index is empty.');
    return;
  }

  // ask permission
  const extra = indexStat.totalSamples > 0 ? ` ${ chalk.bold(indexStat.totalSamples) } samples will be lost.` : '';
  const doDelete: boolean | undefined = await yesNoQuestion('Reset the index for these tests?' + extra);

  if (doDelete === true) {
    const p = indexStat.files.map((stat) => sfm.delete(stat.testPath));
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
): Promise<IndexStat> {
  const pending = [] as IndexFileStat[];

  println('Repris Index Status\n');

  let totalFixtures = 0,
    totalSamples = 0;

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
        totalFixtures += fixtureCount;
        totalSamples += sampleCount;
      }
    }
  }

  if (pending.length > 0) {
    const columns = [
      { id: 'fixtureStat' as typeid, displayName: 'Pending (samples)' },
      { id: 'tombstoneCount' as typeid, displayName: 'Captured' },
    ];

    const report = new TableTreeReporter<IndexFileStat>(columns, {
      annotate: (stat) => {
        const captured = stat.tombstoneCount / (stat.tombstoneCount + stat.fixtureCount);
        const ann = {
          fixtureStat:
            stat.fixtureCount === 0
              ? chalk.dim(`0 (0)`)
              : `${stat.fixtureCount} (${stat.sampleCount})`,
          tombstoneCount:
            stat.tombstoneCount === 0
              ? chalk.dim('0')
              : `${stat.tombstoneCount} (${(100 * captured).toFixed(0)}%)`,
        };
        return annotators.DefaultBag.fromJson(ann);
      },
      render: (stat) => jReporters.utils.formatTestPath(projCfg, stat.testPath),
      pathOf: () => [],
    });

    report.render(pending, process.stderr);
  }

  return {
    totalFixtures,
    totalSamples,
    files: pending,
  };
}
