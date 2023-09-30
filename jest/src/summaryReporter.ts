import chalk from 'chalk';
import type { AggregatedResult, Test, TestContext } from '@jest/test-result';
import type { Config } from '@jest/types';
import { SummaryReporter } from '@jest/reporters';
import { snapshotManager } from '@repris/samplers';
import type { AugmentedTestResult } from './runner.js';
import { StagingAreaResolver } from './snapshotUtils.js';

export default class BenchmarkSummaryReporter extends SummaryReporter {
  projectTestMap = new Map<Config.ProjectConfig, string[]>();

  aggregatedBenchStats = {
    cacheStat: {
      runFixtures: 0,
      skippedFixtures: 0,
      newFixtures: 0,
      totalFixtures: 0,
      stagedFixtures: 0,
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

      stats.cacheStat.runFixtures += stat.cacheStat.runFixtures;
      stats.cacheStat.skippedFixtures += stat.cacheStat.skippedFixtures;
      stats.cacheStat.newFixtures += stat.cacheStat.newFixtures;
      stats.cacheStat.totalFixtures += stat.cacheStat.totalFixtures;
      stats.cacheStat.stagedFixtures += stat.cacheStat.stagedFixtures;

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
        const totalFixtures = stats.cacheStat.totalFixtures + stats.snapshotStat.updatedTotal;
        summary.push(
          ` › ${stats.snapshotStat.updatedTotal} of ${totalFixtures} benchmark snapshots updated.` +
            ' Re-run to collect additional samples.'
        );
      }
    } else {
      if (stats.cacheStat.totalFixtures === 0) {
        if (stats.snapshotStat.updatedTotal > 0) {
          summary.push(
            ` › All ${stats.snapshotStat.updatedTotal} benchmark snapshots updated.` +
              ' Re-run with -u to reset the index.'
          );
        }
      } else {
        summary.push(
          ` › ${stats.cacheStat.stagedFixtures} of ${stats.cacheStat.totalFixtures} benchmark snapshots can be updated.` +
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
        `${stats.cacheStat.stagedFixtures.toString()} stable, ${
          stats.cacheStat.totalFixtures
        } ${deltaStr(stats.cacheStat.newFixtures - stats.snapshotStat.updated)}total`,
      ],
    ];

    rows.forEach(([a, b]) => summary.push(a + b));

    summary.push('');

    return summary;
  }

  private async deleteStagingArea() {
    for (const [projConfig, testPaths] of this.projectTestMap) {
      const stagingArea = new snapshotManager.SnapshotFileManager(StagingAreaResolver(projConfig));
      for (const path of testPaths) {
        await stagingArea.delete(path);
      }
    }
  }
}
