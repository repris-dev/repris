import chalk from 'chalk';
import type { AggregatedResult, Test, TestContext } from '@jest/test-result';
import type { Config } from '@jest/types';
import { SummaryReporter } from '@jest/reporters';

import { snapshotManager } from '@repris/samplers';

import type { AugmentedTestResult } from './runner.js';
import { IndexResolver } from './snapshotUtils.js';

export default class BenchmarkSummaryReporter extends SummaryReporter {
  projectTestMap = new Map<Config.ProjectConfig, string[]>();

  aggregatedBenchStats = {
    cacheStat: {
      runBenchmarks: 0,
      skippedBenchmarks: 0,
      newBenchmarks: 0,
      totalBenchmarks: 0,
      stagedBenchmarks: 0,
    },
    snapshotStat: { updated: 0, updatedTotal: 0 },
    epochStat: { complete: true },
  };

  constructor(private globalConfig: Config.GlobalConfig, private _config?: unknown) {
    super(globalConfig);
  }

  override onTestResult(
    test?: Test,
    testResult?: AugmentedTestResult,
    _results?: AggregatedResult
  ): void {
    const stats = this.aggregatedBenchStats;
    if (testResult?.repris) {
      const stat = testResult.repris;
      // The epoch is complete when *all* snapshots updated
      stats.epochStat.complete = stats.epochStat.complete && stat.epochStat.complete;

      stats.cacheStat.runBenchmarks += stat.cacheStat.runBenchmarks;
      stats.cacheStat.skippedBenchmarks += stat.cacheStat.skippedBenchmarks;
      stats.cacheStat.newBenchmarks += stat.cacheStat.newBenchmarks;
      stats.cacheStat.totalBenchmarks += stat.cacheStat.totalBenchmarks;
      stats.cacheStat.stagedBenchmarks += stat.cacheStat.stagedBenchmarks;

      stats.snapshotStat.updated += stat.snapshotStat.updated;
      stats.snapshotStat.updatedTotal += stat.snapshotStat.updatedTotal;

      if (test && stat.epochStat.complete) {
        const config = test.context.config;
        if (!this.projectTestMap.has(config)) {
          this.projectTestMap.set(config, [test.path]);
        } else {
          this.projectTestMap.get(config)!.push(test.path);
        }
      }
    }
  }

  override async onRunComplete(
    testContexts: Set<TestContext>,
    aggregatedResults: AggregatedResult
  ): Promise<void> {
    const stats = this.aggregatedBenchStats;
    const summary = this.getSummary();

    if (this.globalConfig.updateSnapshot === 'all') {
      if (stats.epochStat.complete) {
        await this.deleteStagingArea();
      }
    }

    summary.forEach(this.log);
    super.onRunComplete(testContexts, aggregatedResults);
  }

  getSummary(): string[] {
    const stats = this.aggregatedBenchStats;
    const summary = [chalk.bold('Benchmark Run Summary')];

    if (this.globalConfig.updateSnapshot === 'all') {
      if (stats.epochStat.complete) {
        summary.push(
          chalk.greenBright(
            ` › All ${stats.snapshotStat.updatedTotal} benchmark snapshots updated.` +
              ' Index cleared.'
          )
        );
      } else {
        const totalBenchmarks = stats.cacheStat.totalBenchmarks + stats.snapshotStat.updatedTotal;
        summary.push(
          ` › ${stats.snapshotStat.updatedTotal} of ${totalBenchmarks} benchmark snapshots updated.` +
            ' Re-run to collect additional samples.'
        );
      }
    } else {
      if (stats.cacheStat.totalBenchmarks === 0) {
        if (stats.snapshotStat.updatedTotal > 0) {
          summary.push(
            ` › All ${stats.snapshotStat.updatedTotal} benchmark snapshots updated.` +
              ' Re-run with -u to reset the index.'
          );
        }
      } else {
        summary.push(
          ` › ${stats.cacheStat.stagedBenchmarks} of ${stats.cacheStat.totalBenchmarks} benchmark snapshots can be updated.` +
            ' Re-run to collect additional samples.'
        );
      }
    }

    summary.push('');

    const deltaStr = (x: number) => (x !== 0 ? chalk.dim(`(${x > 0 ? '+' + x : x}) `) : '');

    const rows = [
      [
        chalk.bold(' Snapshots: '),
        `${stats.snapshotStat.updatedTotal} ${deltaStr(stats.snapshotStat.updated)}updated`,
      ],
      [
        chalk.bold(' Index:     '),
        `${stats.cacheStat.stagedBenchmarks.toString()} stable, ${
          stats.cacheStat.totalBenchmarks
        } ${deltaStr(stats.cacheStat.newBenchmarks - stats.snapshotStat.updated)}total`,
      ],
    ];

    rows.forEach(([a, b]) => summary.push(a + b));

    summary.push('');

    return summary;
  }

  private async deleteStagingArea() {
    for (const [projConfig, testPaths] of this.projectTestMap) {
      const stagingArea = new snapshotManager.SnapshotFileManager(IndexResolver(projConfig));
      for (const path of testPaths) {
        await stagingArea.delete(path);
      }
    }
  }
}
