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

import { annotators } from '@repris/samplers';

import { Column, TableTreeReporter } from './tableReport.js';
import * as config from './config.js';
import { gradedColumns } from './reporterUtils.js';

const { ICONS } = specialChars;
const WARN = chalk.reset.inverse.yellow.bold(' WARN ');

function loadColumns(cfg: config.SCIConfig): Column[] {
  // groups of annotations to report
  const annotationGroups = [...cfg.sample.annotations, ...cfg.conflation.annotations];
  return gradedColumns(annotationGroups);
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

    this.loadingMutex = config.load(globalConfig.rootDir).then((cfg) => {
      const columns = loadColumns(cfg);

      this.testRenderer = new TableTreeReporter(columns, {
        annotate(test) {
          const aar = test as import('./runner.js').AugmentedAssertionResult;

          if (aar.repris?.sample) {
            // annotations produced by the runner
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
