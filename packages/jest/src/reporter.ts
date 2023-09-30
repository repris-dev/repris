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
import { gradedColumns } from './reporterUtils.js';

const { ICONS } = specialChars;
const WARN = chalk.reset.inverse.yellow.bold(' WARN ');

function loadColumns(cfg: config.ReprisConfig): Column[] {
  // Groups of annotations to report
  const annotationGroups = cfg.commands.test?.annotations ?? [];
  // Create columns
  return gradedColumns(annotationGroups, void 0, 'test');
}

export default class SampleReporter extends DefaultReporter {
  static override readonly filename = import.meta.url;

  protected override _globalConfig: Config.GlobalConfig;

  // resolves when the configuration has loaded
  loadingMutex: Promise<void>;
  testRenderer!: TableTreeReporter<AssertionResult>;

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
            return annotators.DefaultBag.fromJson({
              ...aar.repris.sample,
              ...aar.repris?.digest,
              ...aar.repris?.benchmark
            });
          }
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

  static filterTestResults(testResults: Array<AssertionResult>): Array<AssertionResult> {
    return testResults.filter(({ status }) => status !== 'pending');
  }

  protected override __wrapStdio(
    stream: NodeJS.WritableStream | NodeJS.WriteStream,
  ): void {
    const write = stream.write.bind(stream);

    stream.write = (chunk: string) => {
      this.__clearStatus();
      write(chunk);
      this.__printStatus();
      return true;
    };
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
    const columns = this.testRenderer.columns;

    // configuration warnings
    if (columns.length === 0) {
      this.log(WARN + ' No annotations are configured');
    } else {
      // report unknown annotations
      const missing = [] as typeid[];
      for (const c of columns) {
        if (!c.type || !annotators.supports(c.type)) {
          missing.push(c.type);
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
        this.testRenderer.render(filtered, process.stdout);
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
