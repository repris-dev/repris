/*
import type { Config } from '@jest/types';
import type { Test, TestResult, TestCaseResult } from '@jest/test-result';
import { samples, stopwatch } from '@sampleci/samplers';

class CustomReporter {
  constructor(
      private globalConfig: Config.GlobalConfig,
      private reporterOptions: unknown,
      private reporterContext: unknown)
  {
  }

  onRunComplete(testContexts: unknown, results: unknown) {
  }

  onTestStart(test: unknown) {
  }

  onTestResult(test: Test, testResult: TestResult, aggregatedResult: unknown) {
  }

  onTestCaseResult(
    test: Test,
    testCaseResult: TestCaseResult & { sample?: any },
  ) {
    if (testCaseResult.sample) {
      samples.Duration.fromJson(testCaseResult.sample)
      console.info('>', testCaseResult.title, testCaseResult.sample);
    }
  }

  onRunStart (
    results: unknown,
    options: unknown,
  ) {
  }

  onTestCaseStart(test: unknown) {
  }

  // Optionally, reporters can force Jest to exit with non zero code by returning
  // an `Error` from `getLastError()` method.
  getLastError() {
  }
}

export default CustomReporter;
*/

/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

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
import { formatTime, specialChars } from 'jest-util';
import { DefaultReporter } from '@jest/reporters';
import { samples, wiretypes as wt } from '@sampleci/samplers';
import { Status, typeid, assert } from '@sampleci/base';

const { ICONS } = specialChars;

export default class VerboseReporter extends DefaultReporter {
  static override readonly filename = import.meta.url;

  protected override _globalConfig: Config.GlobalConfig;

  table = new StopwatchTableReporter<string>();
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
          this.log(this.table.renderTitles().padStart(this.consoleWidth.columns, ' '));
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
    const suite = VerboseReporter.groupTestsBySuites(testResults);

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
    const sample = this.table.renderRow(test.fullName);
    const title = chalk.dim(test.title);
    const prefix = '  '.repeat(indentLevel || 0) + `${status} ${title}`;

    if (sample) {
      const row = this.table.renderRow(test.fullName);
      const w = this.consoleWidth.columns;
      //const gap = ' '.repeat(this.consoleWidth.columns - (prefix.length + row.length))
      const moveTo = `\x1b[${ (w - row.length) + 1 }G`;
 
      this.log(prefix + moveTo + row);
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


const fmtUSecond = new Intl.NumberFormat(void 0, { maximumFractionDigits: 0 });
const fmtCoeff = new Intl.NumberFormat(void 0, { maximumFractionDigits: 2 });

class StopwatchTableReporter<Id> {
  constructor() { this.reset() }

  columns = [
    { title: 'min',   units: 'μs',      format: (s: samples.Duration) => fmtUSecond.format(s.summary().range()[0]) },
    { title: 'mean',  units: 'μs',      format: (s: samples.Duration) => fmtUSecond.format(s.summary().mean()) },
    { title: 's.d.',  units: undefined, format: (s: samples.Duration) => fmtUSecond.format(s.summary().std()) },
    { title: 'skew',  units: undefined, format: (s: samples.Duration) => fmtCoeff.format(s.summary().skewness()) },
    { title: 'N',     units: undefined, format: (s: samples.Duration) => fmtUSecond.format(s.count()) }
  ];

  margin = 2;
  rowIndex = new Map<Id, string[]>();
  columnWidths!: number[];
  titleCells!: string[];

  count() { return this.rowIndex.size; }

  load(rowid: Id, sample: wt.SampleData): boolean {
    const d = samples.Duration.fromJson(sample);
    if (Status.isErr(d)) { return false; }

    const duration = d[0];
    const cells = this.columns.map(c => c.format(duration));

    this.columnWidths.forEach((w, i) => this.columnWidths[i] = Math.max(w, cells[i].length));
    this.rowIndex.set(rowid, cells);

    return true;  
  }

  reset() {
    this.rowIndex.clear();
    this.titleCells = this.columns.map(
      c => c.title + (c.units ? ` (${ c.units })` : '')
    );
    this.columnWidths = this.titleCells.map(c => c.length);
  }

  _renderRow(cells: string[]) {
    assert.eq(cells.length, this.columns.length);
  
    const margin = ' '.repeat(this.margin);
    let row = [];

    for (let i = 0; i < cells.length; i++) {
      const w = this.columnWidths[i];
      row.push(cells[i].padStart(w, ' '));
    }

    return row.join(margin);
  }

  renderTitles(): string {
    return this._renderRow(this.titleCells);
  }

  renderRow(rowid: Id): string {
    assert.eq(this.rowIndex.has(rowid), true);
    return this._renderRow(this.rowIndex.get(rowid)!);
  }
}

/*

 PASS  .tsc/sync.js (6.302 s)        
                                     mean (ns)       s.d.    n      
  Set<T>
    ✓ .add()                            71,422  76,059.71  500
    ✓ .forEach()                        15,512   6,940.93  500
  Map<K, V>
    .set()                              87,991  70,268.53  500
      ✓ 32:1024                      4,352,352       ±0.5    3
      ✓ 62:1024                      4,352,352       ±0.5    3

*/