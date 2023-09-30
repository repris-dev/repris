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

import { typeid } from '@sampleci/base';
import { annotators } from '@sampleci/samplers';

import { TerminalReport, Column } from './tableReport.js';
import * as config from './config.js';

type ReportTree<T> = {
  depth: number;
  title: string;
  children: ReportTree<T>[];
  items: T[];
};

type TestSuite = ReportTree<AssertionResult>;

const { ICONS } = specialChars;
const WARN = chalk.reset.inverse.yellow.bold(' WARN ');

async function loadReporter(rootDir: string): Promise<TerminalReport<AssertionResult>> {
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

  return new TerminalReport<AssertionResult>(columns);
}

export default class SampleReporter extends DefaultReporter {
  static override readonly filename = import.meta.url;

  protected override _globalConfig: Config.GlobalConfig;

  // resolves when the configuration has loaded
  loadingMutex: Promise<void>;
  table: TerminalReport<AssertionResult> | undefined;
  consoleWidth!: { columns: number };

  constructor(globalConfig: Config.GlobalConfig, private _config?: unknown) {
    super(globalConfig);
    this._globalConfig = globalConfig;

    this.loadingMutex = loadReporter(globalConfig.rootDir).then((table) => {
      this.table = table;
    });
  }

  protected override __wrapStdio(stream: NodeJS.WritableStream | NodeJS.WriteStream): void {
    super.__wrapStdio(stream);
    this.consoleWidth = stream as NodeJS.WriteStream;
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
    const columns = this.table!.columns;

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
      this.printTestFileHeader(result.testFilePath, test.context.config, result);

      if (!result.testExecError && !result.skipped) {
        // extract annotations from this test result
        for (const assertionResult of result.testResults) {
          const aar = assertionResult as import('./runner.js').AugmentedAssertionResult;

          if (aar.sci?.sample) {
            const annotations = { ...aar.sci.sample, ...aar.sci?.conflation };
            this.table!.load(assertionResult, annotations);
          }
        }

        this._logTestResults(test.path, result.testResults);
      }

      this.printTestFileFailureMessage(result.testFilePath, test.context.config, result);

      // Reset column widths for the next test suite
      this.table!.reset();
    }

    super.forceFlushBufferedOutput();
  }

  private _logTestResults(path: string, testResults: AssertionResult[]) {
    const suite = createTreeFrom(testResults, (ar) => ar.ancestorTitles);

    // print columns
    if (this.table!.count() > 0) {
      const w = this.consoleWidth.columns;
      const line = this.table!.renderTitles();
      const moveTo = `\x1b[${w - line.length + 1}G`;
      this.log(moveTo + line.line);
    }

    this._logSuite(path, suite);
    this._logLine();
  }

  private _logSuite(path: string, suite: TestSuite) {
    if (suite.title) {
      this._logLine(suite.title, suite.depth);
    }

    this._logTests(path, suite.items, suite.depth + 1);
    suite.children.forEach((suite) => this._logSuite(path, suite));
  }

  private _logTests(path: string, tests: AssertionResult[], indentLevel: number) {
    const pending = [] as AssertionResult[];
    const todo = [] as AssertionResult[];

    for (const test of tests) {
      if (test.status === 'pending') {
        pending.push(test);
      } else if (test.status === 'todo') {
        todo.push(test);
      } else {
        this._logTest(path, test, indentLevel);
      }
    }

    pending.forEach((t) => this._logTodoOrPendingTest(t, indentLevel));
    todo.forEach((t) => this._logTodoOrPendingTest(t, indentLevel));
  }

  private _logTest(path: string, test: AssertionResult, indentLevel: number) {
    const icon = getIcon(test.status);
    const title = '  '.repeat(indentLevel) + `${icon} ${chalk.dim(test.title)}`;
    const renderedCells = this.table!.renderRow(test);

    if (renderedCells) {
      // move to terminal column to right-align the table
      const w = this.consoleWidth.columns;
      const moveTo = `\x1b[${w - renderedCells.length + 1}G`;

      this.log(title + moveTo + renderedCells.line);
    } else {
      this.log(title);
    }
  }

  private _logTodoOrPendingTest(test: AssertionResult, indentLevel: number) {
    const printedTestStatus = test.status === 'pending' ? 'skipped' : test.status;
    const icon = getIcon(test.status);
    const text = chalk.dim(`${printedTestStatus} ${test.title}`);

    this._logLine(`${icon} ${text}`, indentLevel);
  }

  private _logLine(str = '', indentLevel = 0) {
    const indentation = '  '.repeat(indentLevel);
    this.log(indentation + str);
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

function createTreeFrom<T>(testResults: T[], titles: (test: T) => string[]): ReportTree<T> {
  const root: ReportTree<T> = { depth: 0, children: [], items: [], title: '' };

  testResults.forEach((testResult) => {
    let targetSuite = root;
    let depth = 1;
    
    // Find the target suite for this test, creating nested suites as necessary.
    for (const title of titles(testResult)) {
      let matchingSuite = targetSuite.children.find((s) => s.title === title);

      if (!matchingSuite) {
        matchingSuite = { depth, children: [], items: [], title };
        targetSuite.children.push(matchingSuite);
      }

      targetSuite = matchingSuite;
      depth++;
    }

    targetSuite.items.push(testResult);
  });

  return root;
}
