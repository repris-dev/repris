import chalk from 'chalk';
import type {
  AggregatedResult,
  AssertionResult,
  Status,
  Test,
  TestResult,
} from '@jest/test-result';
import type { Config } from '@jest/types';
import { specialChars, preRunMessage } from 'jest-util';
import { DefaultReporter, ReporterOnStartOptions } from '@jest/reporters';

import { typeid } from '@repris/base';
import { annotators } from '@repris/samplers';

import { Column, TableTreeReporter } from './tableReport.js';
import * as config from './config.js';

const { ICONS } = specialChars;
const WARN = chalk.reset.inverse.yellow.bold(' WARN ');

async function loadReporter(rootDir: string): Promise<Column[]> {
  const cfg = await config.load(rootDir);

  // groups of annotations to report
  const annotationGroups = [cfg.sample.annotations, cfg.conflation.annotations];
  const columns: Column[] = [];

  // one column for each visible annotation
  for (const g of annotationGroups) {
    for (const ann of g) {
      const a = typeof ann !== 'string' ? { id: ann[0], ...ann[1] } : { id: ann };

      if (typeof a.display === 'undefined' || a.display) {
        const grading =
          a.grading !== undefined
            ? Array.isArray(a.grading)
              ? { id: a.grading[0] as typeid, thresholds: a.grading[1].thresholds }
              : { id: a.id as typeid, thresholds: a.grading?.thresholds }
            : undefined;

        columns.push({
          id: a.id as typeid,
          displayName: a.displayName ?? a.id,
          grading,
        });
      }
    }
  }

  return columns;
}

export default class SampleReporter extends DefaultReporter {
  static override readonly filename = import.meta.url;

  protected override _globalConfig: Config.GlobalConfig;

  // resolves when the configuration has loaded
  loadingMutex: Promise<void>;
  testRenderer!: TableTreeReporter<AssertionResult>;
  writeStream!: NodeJS.WriteStream;

  constructor(globalConfig: Config.GlobalConfig, private _config?: unknown) {
    super(globalConfig);
    this._globalConfig = globalConfig;

    this.loadingMutex = loadReporter(globalConfig.rootDir).then((columns) => {
      this.testRenderer = new TableTreeReporter(columns, {
        annotate(test) {
          const aar = test as import('./runner.js').AugmentedAssertionResult;

          if (aar.repris?.sample) {
            const annotations = { ...aar.repris.sample, ...aar.repris?.conflation };
            const bag = annotators.DefaultBag.fromJson(annotations);
            return bag;
          }

          return void 0;
        },
        pathOf(test) {
          return test.ancestorTitles;
        },
        render(test) {
          return `${getIcon(test.status)} ${chalk.dim(test.title)}`;
        },
      });
    });
  }

  protected override __wrapStdio(stream: NodeJS.WriteStream): void {
    super.__wrapStdio(stream);
    this.writeStream = stream;
  }

  static filterTestResults(testResults: Array<AssertionResult>): Array<AssertionResult> {
    return testResults.filter(({ status }) => status !== 'pending');
  }

  override async onRunStart(
    aggregatedResults: AggregatedResult,
    options: ReporterOnStartOptions
  ): Promise<void> {
    // always show the status/progress bar since benchmarks are usually long running
    super.onRunStart(aggregatedResults, { ...options, showStatus: true });
    preRunMessage.remove(process.stderr);

    // Throws if there is a configuration error
    await this.loadingMutex;
    const columns = this.testRenderer!.columns;

    // configuration warnings
    if (columns.length === 0) {
      this.log(WARN + ' No annotations are configured');
    } else {
      // report unknown annotations
      const missing = [];
      for (const c of columns) {
        if (!c.id || !annotators.supports(c.id)) {
          missing.push(c.id);
        }
      }

      if (missing.length > 0) {
        this.log(WARN + ' Unrecognized annotation(s): ' + missing.join(', '));
      }
    }
  }

  override onTestResult(test: Test, result: TestResult, aggregatedResults: AggregatedResult): void {
    super.testFinished(test.context.config, result, aggregatedResults);

    if (!result.skipped) {
      const filtered = result.testResults.filter(
        (test) => test.status !== 'todo' && test.status !== 'pending'
      );

      if (filtered.length > 0) {
        this.printTestFileHeader(result.testFilePath, test.context.config, result);
        this.testRenderer.render(filtered, this.writeStream!);
      }
    }

    this.printTestFileFailureMessage(result.testFilePath, test.context.config, result);
    super.forceFlushBufferedOutput();
  }
}

function getIcon(status: Status) {
  switch (status) {
    case 'failed':
      return chalk.red(ICONS.failed);
    case 'pending':
      return chalk.yellow(ICONS.pending);
    case 'todo':
      return chalk.magenta(ICONS.todo);
  }
  return chalk.green(ICONS.success);
}
