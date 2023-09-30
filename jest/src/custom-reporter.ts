import chalk from 'chalk';
import type {
  AggregatedResult,
  AssertionResult,
  Suite,
  Test,
  TestCaseResult,
  TestResult,
} from '@jest/test-result';
import type { Config } from '@jest/types';
import { specialChars, preRunMessage } from 'jest-util';
import { DefaultReporter, ReporterOnStartOptions } from '@jest/reporters';
import { annotators, wiretypes as wt } from '@sampleci/samplers';
import { TerminalReport, Column } from './durationReport.js';

export type ReporterConfig = {
  columns?: Column[]
}

type TableRowKey = `${ string }-${ string }`;

const { ICONS } = specialChars;
const WARN = chalk.reset.inverse.yellow.bold(' WARN ');

export default class SampleReporter extends DefaultReporter {
  static override readonly filename = import.meta.url;

  protected override _globalConfig: Config.GlobalConfig;

  table: TerminalReport<TableRowKey>;
  consoleWidth!: { columns: number };

  constructor(
    globalConfig: Config.GlobalConfig,
    private config?: ReporterConfig
  ) {
    super(globalConfig);

    this.table = new TerminalReport<TableRowKey>(config?.columns ?? []);
    this._globalConfig = globalConfig;
  }

  protected override __wrapStdio(
    stream: NodeJS.WritableStream | NodeJS.WriteStream,
  ): void {
    super.__wrapStdio(stream);
    this.consoleWidth = stream as NodeJS.WriteStream;
  }

  static filterTestResults(
    testResults: Array<AssertionResult>,
  ): Array<AssertionResult> {
    return testResults.filter(({ status }) => status !== 'pending');
  }

  static groupTestsBySuites(testResults: Array<AssertionResult>): Suite {
    const root: Suite = { suites: [], tests: [], title: '' };

    testResults.forEach(testResult => {
      let targetSuite = root;

      // Find the target suite for this test, creating nested suites as necessary.
      for (const title of testResult.ancestorTitles) {
        let matchingSuite = targetSuite.suites.find(s => s.title === title);

        if (!matchingSuite) {
          matchingSuite = { suites: [], tests: [], title };
          targetSuite.suites.push(matchingSuite);
        }

        targetSuite = matchingSuite;
      }

      targetSuite.tests.push(testResult);
    });

    return root;
  }

  override onRunStart(
    aggregatedResults: AggregatedResult,
    options: ReporterOnStartOptions,
  ): void {
    // always show the status/progress bar since benchmarks are usually long running
    super.onRunStart(aggregatedResults, { ...options, showStatus: true });
    preRunMessage.remove(process.stderr);

    // configuration warnings
    if (!this.config || !this.config.columns || this.config.columns.length === 0) {
      this.log(WARN + ' No annotations are configured');
    } else {
      // report unknown annotations
      const missing = [];
      for (const c of this.config.columns) {
        if (!c.id || !annotators.supports(c.id)) {
          missing.push(c.id);
        }
      }

      if (missing.length > 0) {
        this.log(WARN + ' Unrecognized annotation(s): ' + missing.join(', '));
      }
    }
  }

  override onTestResult(
    test: Test,
    result: TestResult,
    aggregatedResults: AggregatedResult,
  ): void {
    super.testFinished(test.context.config, result, aggregatedResults);

    if (!result.skipped) {
      this.printTestFileHeader(
        result.testFilePath,
        test.context.config,
        result,
      );

      if (!result.testExecError && !result.skipped) {
        if (this.table.count() > 0) {
          const w = this.consoleWidth.columns;
          const line = this.table.renderTitles();
          const moveTo = `\x1b[${ (w - line.length) + 1 }G`;
          this.log(moveTo + line.line);
        }
        this._logTestResults(test.path, result.testResults);
      }

      this.printTestFileFailureMessage(
        result.testFilePath,
        test.context.config,
        result,
      );
    }

    super.forceFlushBufferedOutput();
  }

  override onTestCaseResult(
    test: Test,
    tcr: TestCaseResult & { sample?: wt.SampleData },
  ) {
    super.onTestCaseResult(test, tcr);

    if (tcr.sample) {
      this.table.load(`${ test.path }-${ tcr.fullName }`, tcr.sample)
    }
  }

  private _logTestResults(path: string, testResults: Array<AssertionResult>) {
    const suite = SampleReporter.groupTestsBySuites(testResults);

    this._logSuite(path, suite, 0);
    this._logLine();
  }

  private _logSuite(path: string, suite: Suite, indentLevel: number) {
    if (suite.title) { 
      this._logLine(suite.title, indentLevel);
    }

    this._logTests(path, suite.tests, indentLevel + 1);
    suite.suites.forEach(suite => this._logSuite(path, suite, indentLevel + 1));
  }

  private _getIcon(status: string) {
    switch (status) {
      case 'failed': return chalk.red(ICONS.failed);
      case 'pending': return chalk.yellow(ICONS.pending);
      case 'todo': return chalk.magenta(ICONS.todo);
    }
    return chalk.green(ICONS.success);
  }

  private _logTests(path: string, tests: Array<AssertionResult>, indentLevel: number) {
    if (this._globalConfig.expand) {
      tests.forEach(test => this._logTest(path, test, indentLevel));
    } else {
      const summedTests = tests.reduce<{
        pending: Array<AssertionResult>;
        todo: Array<AssertionResult>;
      }>(
        (result, test) => {
          if (test.status === 'pending') {
            result.pending.push(test);
          } else if (test.status === 'todo') {
            result.todo.push(test);
          } else {
            this._logTest(path, test, indentLevel);
          }

          return result;
        },
        { pending: [], todo: [] },
      );

      if (summedTests.pending.length > 0) {
        summedTests.pending.forEach(this._logTodoOrPendingTest(indentLevel));
      }

      if (summedTests.todo.length > 0) {
        summedTests.todo.forEach(this._logTodoOrPendingTest(indentLevel));
      }
    }
  }
  
  private _logTest(path: string, test: AssertionResult, indentLevel: number) {
    const status = this._getIcon(test.status);
    const title = chalk.dim(test.title);
    const prefix = '  '.repeat(indentLevel || 0) + `${status} ${title}`;
    const renderedCells = this.table.renderRow(`${ path }-${ test.fullName }`);

    if (renderedCells) {
      // move to terminal column to right-align the table
      const w = this.consoleWidth.columns;
      const moveTo = `\x1b[${ (w - renderedCells.length) + 1 }G`;
 
      this.log(prefix + moveTo + renderedCells.line);
    } else {
      this.log(prefix);
    }
  }

  private _logTodoOrPendingTest(indentLevel: number) {
    return (test: AssertionResult): void => {
      const printedTestStatus = test.status === 'pending' ? 'skipped' : test.status;
      const icon = this._getIcon(test.status);
      const text = chalk.dim(`${printedTestStatus} ${test.title}`);

      this._logLine(`${icon} ${text}`, indentLevel);
    };
  }

  private _logLine(str?: string, indentLevel?: number) {
    const indentation = '  '.repeat(indentLevel || 0);
    this.log(indentation + (str || ''));
  }
}
