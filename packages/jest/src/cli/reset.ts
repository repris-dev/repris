import chalk from 'chalk';
import * as jestConfig from 'jest-config';

import { Config } from '@jest/types';
import * as core from '@jest/core';
import * as jReporters from '@jest/reporters';
import Runtime from 'jest-runtime';

import { iterator, typeid } from '@repris/base';
import { snapshotManager, annotators } from '@repris/samplers';

import { IndexResolver } from '../snapshotUtils.js';
import { TableTreeReporter } from '../tableReport.js';
import { println, panic, yesNoQuestion } from './util.js';

type IndexStat = {
  totalBenchmarks: number;
  totalSamples: number;
  files: IndexFileStat[];
};

type IndexFileStat = {
  testPath: string;
  pendingBenchmarkCount: number;
  totalBenchmarkCount: number;
  sampleCount: number;
};

export async function reset(_argv: string[]) {
  const cfg = await jestConfig.readConfigs({ $0: '', _: [] }, [process.cwd()]);
  const projCfg = cfg.configs[0];
  const context = await Runtime.default.createContext(projCfg, {
    maxWorkers: 1,
    watchman: false,
  });

  const sfm = new snapshotManager.SnapshotFileManager(IndexResolver(projCfg));

  // test paths
  const search = new core.SearchSource(context);
  const testFiles = (await search.getTestPaths(cfg.globalConfig)).tests;

  // print the index
  const indexStat = await showIndexSummary(projCfg, testFiles, sfm);

  // Nothing to do if the index is empty
  if (indexStat.files.length === 0) {
    println('Index is empty.');
    return;
  }

  // ask permission
  const extra =
    indexStat.totalSamples > 0
      ? ` ${chalk.bold(indexStat.totalSamples)} samples from ${chalk.bold(
          indexStat.totalBenchmarks
        )} benchmarks will be lost.`
      : '';

  const doDelete: boolean | undefined = await yesNoQuestion('Reset the index?' + extra);

  if (doDelete === true) {
    const p = indexStat.files.map(stat => sfm.delete(stat.testPath));
    await Promise.all(p);

    println('Index reset');
  } else {
    println('Exiting.');
  }
}

async function showIndexSummary(
  projCfg: Config.ProjectConfig,
  testFiles: jReporters.Test[],
  sfm: snapshotManager.SnapshotFileManager
): Promise<IndexStat> {
  const pending = [] as IndexFileStat[];

  println('Repris Index Status:\n');

  let totalBenchmarks = 0,
    totalSamples = 0;

  for (const t of testFiles) {
    if (await sfm.exists(t.path)) {
      const [snapshot, err] = await sfm.loadOrCreate(t.path);

      if (err) panic(err);

      let benchmarkCount = 0;
      let sampleCount = 0;

      for (const benchmark of snapshot!.allBenchmarks()) {
        benchmarkCount++;
        sampleCount += iterator.count(benchmark.samples());
      }

      const tombstoneCount = iterator.count(snapshot!.allTombstones());

      if (benchmarkCount > 0 || tombstoneCount > 0) {
        pending.push({
          testPath: t.path,
          pendingBenchmarkCount: benchmarkCount,
          totalBenchmarkCount: tombstoneCount + benchmarkCount,
          sampleCount,
        });

        totalBenchmarks += benchmarkCount;
        totalSamples += sampleCount;
      }
    }
  }

  if (pending.length > 0) {
    const columns = [
      { type: 'uncapturedStat' as typeid, displayName: 'Benchmarks' },
      { type: 'uncapturedSamplesStat' as typeid, displayName: 'Samples' },
    ];

    const report = new TableTreeReporter<IndexFileStat>(columns, {
      annotate: stat => {
        const uncaptured = stat.pendingBenchmarkCount;
        const benchSuffix = `${chalk.dim('of ' + stat.totalBenchmarkCount)}`;

        return annotators.DefaultBag.fromJson({
          uncapturedStat:
            stat.pendingBenchmarkCount === 0
              ? chalk.dim('0 ') + benchSuffix
              : `${chalk.bold(uncaptured)} ${benchSuffix}`,
          uncapturedSamplesStat:
            stat.sampleCount === 0 ? chalk.dim(0) : chalk.bold(stat.sampleCount),
        });
      },
      render: stat => jReporters.utils.formatTestPath(projCfg, stat.testPath),
      pathOf: () => [],
    });

    report.render(pending, process.stderr);
  }

  return {
    totalBenchmarks,
    totalSamples,
    files: pending,
  };
}
