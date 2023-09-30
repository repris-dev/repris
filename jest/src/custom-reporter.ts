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
import { specialChars } from 'jest-util';
import { DefaultReporter } from '@jest/reporters';
import { wiretypes as wt } from '@sampleci/samplers';
import { typeid } from '@sampleci/base';
import { TerminalReport, Column } from './durationReport.js';

const { ICONS } = specialChars;

const columns: Column[] = [
  { id: 'duration:n' as typeid, displayName: 'n' },

  { id: 'duration:min' as typeid, displayName: 'min' },

  { id: 'mode:kde' as typeid, displayName: 'kde' },
  { id: 'mode:kde:dispersion' as typeid, displayName: 'kde-d' },

  { id: 'mode:hsm' as typeid, displayName: 'hsm' },
];

export default class SampleReporter extends DefaultReporter {
  static override readonly filename = import.meta.url;

  protected override _globalConfig: Config.GlobalConfig;

  table = new TerminalReport<string>(columns);
  consoleWidth!: { columns: number };

  constructor(globalConfig: Config.GlobalConfig) {
    super(globalConfig);
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
    return testResults.filter(({status}) => status !== 'pending');
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
          const moveTo = `\x1b[${ (w - line.columns) + 1 }G`;
          this.log(moveTo + line.line);
        }
        this._logTestResults(result.testResults);
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
    if (tcr.sample) {
      this.table.load(tcr.fullName, tcr.sample)
    }
  }

  private _logTestResults(testResults: Array<AssertionResult>) {
    const suite = SampleReporter.groupTestsBySuites(testResults);

    this._logSuite(suite, 0);
    this._logLine();
  }

  private _logSuite(suite: Suite, indentLevel: number) {
    if (suite.title) { 
      this._logLine(suite.title, indentLevel);
    }

    this._logTests(suite.tests, indentLevel + 1);
    suite.suites.forEach(suite => this._logSuite(suite, indentLevel + 1));
  }

  private _getIcon(status: string) {
    switch (status) {
      case 'failed': return chalk.red(ICONS.failed);
      case 'pending': return chalk.yellow(ICONS.pending);
      case 'todo': return chalk.magenta(ICONS.todo);
    }
    return chalk.green(ICONS.success);
  }

  private _logTests(tests: Array<AssertionResult>, indentLevel: number) {
    if (this._globalConfig.expand) {
      tests.forEach(test => this._logTest(test, indentLevel));
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
            this._logTest(test, indentLevel);
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
  
  private _logTest(test: AssertionResult & { sample?: any }, indentLevel: number) {
    const status = this._getIcon(test.status);
    const title = chalk.dim(test.title);
    const prefix = '  '.repeat(indentLevel || 0) + `${status} ${title}`;
    const renderedCells = this.table.renderRow(test.fullName);

    if (renderedCells) {
      // move to terminal column to right-align the table
      const w = this.consoleWidth.columns;
      const moveTo = `\x1b[${ (w - renderedCells.columns) + 1 }G`;
 
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
