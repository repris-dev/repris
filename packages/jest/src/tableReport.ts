import chalk from 'chalk';
import { assert, typeid, quantity as q } from '@repris/base';
import { annotators as anno, annotators } from '@repris/samplers';
import * as config from './config.js';
import * as cli from './cli.js';

export interface ColumnGrading {
  type: typeid;
  ctx?: config.Ctx[];
  rules?: config.GradingThreshold[];
}

export interface Column {
  /** The annotation which this column displays */
  type: typeid;
  /** The location of the annotation */
  ctx?: config.Ctx[];
  /** Column header */
  displayName?: string;
  /** The units of the annotation */
  units?: string;
  /** Style config for individual cells */
  grading?: ColumnGrading;
}

export interface RenderedLine {
  line: string;
  length: number;
}

type Cell = string | readonly [text: string, len: number];

const Cell = {
  pad(c: Cell, columnWidth: number) {
    const width = Cell.length(c);
    const txt = Cell.text(c);

    if (columnWidth > width) {
      return ' '.repeat(columnWidth - width) + txt;
    }

    return txt;
  },

  length(c: Cell) {
    return typeof c === 'string' ? cli.util.visibleWidth(c) : c[1];
  },

  text(c: Cell) {
    return typeof c === 'string' ? c : c[0];
  },

  join(a: Cell, b: Cell): Cell {
    const at = typeof a === 'string' ? a : a[0];
    const bt = typeof b === 'string' ? b : b[0];

    return [at + bt, Cell.length(a) + Cell.length(b)];
  },
};

export class TerminalReport<Id> {
  constructor(public readonly columns: Column[]) {
    this.reset();
  }

  fmt = new AnnotationFormatter();
  colMargin = 2;
  emptyCell = [chalk.dim('?'), 1] as Cell;
  rowIndex = new Map<Id, { cells: Cell[]; bag: anno.AnnotationBag }[]>();
  columnWidths!: number[];
  titleCells!: string[];

  count() {
    return this.rowIndex.size;
  }

  /**
   * Load a sample in to the table.
   * Multiple samples can have the same id. When rendered, samples by the same id
   * are rendered in the order they were loaded in to the table.
   */
  load(rowid: Id, bag: anno.AnnotationBag): boolean {
    const cells = this.columns.map(c => {
      const ann = bag.annotations.get(c.type, c.ctx);

      if (ann !== undefined) {
        let cell = this.fmt.format(ann);
        if (c.grading !== void 0) {
          cell = this._colorizeByQuality(cell, c.grading, bag);
        }

        return cell;
      }

      // The annotation for this sample wasn't found
      return this.emptyCell;
    });

    // update column widths
    this.columnWidths.forEach(
      (w, i) => (this.columnWidths[i] = Math.max(w, Cell.length(cells[i]))),
    );

    const entry = this.rowIndex.get(rowid) ?? [];
    entry.push({ cells, bag });

    this.rowIndex.set(rowid, entry);
    return true;
  }

  /**
   * @param cell The cell to colorize
   * @param config Configuration of the quality annotation
   * @param bag A bag of annotations containing the quality annotation
   */
  private _colorizeByQuality(cell: Cell, cfg: ColumnGrading, bag: anno.AnnotationBag): Cell {
    const ann = bag.annotations.get(cfg.type, cfg.ctx);

    if (ann !== void 0 && Array.isArray(cfg.rules)) {
      let matchingRule: config.GradingThreshold | undefined;

      for (let t of cfg.rules) {
        if (annotators.meetsCondition(ann, t)) matchingRule = t;
      }

      if (matchingRule !== void 0) {
        return [matchingRule.apply(Cell.text(cell)), Cell.length(cell)];
      }
    }

    // Hex color
    if (typeof ann === 'string' && ann.length > 0 && ann[0] === '#') {
      return [chalk.hex(ann)(Cell.text(cell)), Cell.length(cell)];
    }

    //  Either:
    //   - the annotation wasn't found
    //   - the annotation wasn't a number,
    //   - the annotation wasn't a valid hexadecimal color
    //   - the number was outside the minimum thresholds of the
    //     quality config
    return cell;
  }

  reset() {
    this.rowIndex.clear();
    this.titleCells = this.columns.map(
      c => (c.displayName ?? c.type) + (c.units ? ` (${c.units})` : ''),
    );
    this.columnWidths = this.titleCells.map(c => c.length);
  }

  private _renderRow(cells: Cell[]): RenderedLine {
    assert.eq(cells.length, this.columns.length);

    const margin = ' '.repeat(this.colMargin);
    let row = [];
    let sumWidth = 0;

    for (let i = 0; i < cells.length; i++) {
      const w = this.columnWidths[i];
      row.push(Cell.pad(cells[i], w));
      sumWidth += w;
    }

    return {
      line: row.join(margin),
      length: sumWidth + (cells.length - 1) * this.colMargin,
    };
  }

  renderTitles(): RenderedLine {
    return this._renderRow(this.titleCells);
  }

  renderRow(rowid: Id): RenderedLine | undefined {
    if (!this.rowIndex.has(rowid)) {
      return;
    }

    const orderedEntries = this.rowIndex.get(rowid)!;
    assert.gt(orderedEntries.length, 0);

    const row = this._renderRow(orderedEntries.shift()!.cells);
    if (orderedEntries.length === 0) {
      this.rowIndex.delete(rowid);
    }

    return row;
  }
}

class AnnotationFormatter {
  private numeric = {
    int: new Intl.NumberFormat(void 0, { maximumFractionDigits: 0 }),
    number: new Intl.NumberFormat(void 0, { maximumFractionDigits: 3 }),
  };

  private quantities = new Map<q.Unit, q.Formatter>();

  format(a: anno.Annotation): Cell {
    const formatters = this.numeric;

    switch (typeof a) {
      case 'string':
        return a;

      case 'bigint':
        return formatters.int.format(a);

      case 'boolean':
        return a ? 'T' : 'F';

      case 'number':
        return Math.round(a) === a ? formatters.int.format(a) : formatters.number.format(a);

      case 'object': {
        if (Array.isArray(a)) {
          let cell: Cell = [chalk.dim('['), 1],
            k = a.length;

          for (let i = 0; i < k; i++) {
            const subCell = this.format(a[i]);
            cell = Cell.join(cell, subCell);

            if (i < k - 1) {
              cell = Cell.join(cell, [chalk.dim(', '), 2]);
            }
          }

          return Cell.join(cell, [chalk.dim(']'), 1]);
        }

        return this.formatQuantity(a);
      }
    }

    assert.is(false, `Failed to format value ${a}`);
  }

  formatQuantity(quantity: q.Quantity): string {
    const unit = quantity[q.UnitTag];
    let formatter = this.quantities.get(unit);

    if (formatter === void 0) {
      // cache the formatter for this unit
      this.quantities.set(unit, (formatter = q.formatter(q.getKind(unit))));
    }

    return formatter.format(quantity);
  }
}

type ReportTree<T> = {
  depth: number;
  node: string;
  children: ReportTree<T>[];
  items: T[];
};

interface TreeStrategy<Leaf> {
  pathOf(leaf: Leaf): string[];
  render(leaf: Leaf): string;
  annotate(leaf: Leaf): anno.AnnotationBag | undefined;
}

export class TableTreeReporter<Leaf> {
  table: TerminalReport<Leaf>;

  constructor(
    public readonly columns: Column[],
    private strategy: TreeStrategy<Leaf>,
  ) {
    this.table = new TerminalReport(columns);
  }

  render(items: Iterable<Leaf>, stream: NodeJS.WriteStream) {
    const strat = this.strategy;
    const itemArr = [] as Leaf[];

    for (const item of items) {
      itemArr.push(item);
      const bag = strat.annotate(item);

      if (bag) {
        this.table.load(item, bag);
      }
    }

    const tree = this.#createTreeFrom(itemArr);

    this.#renderColumns(stream, stream.columns);
    this.#logSuite(tree, stream);

    stream.write('\n');

    this.table.reset();
  }

  #renderColumns(stream: NodeJS.WriteStream, width: number) {
    if (this.table!.count() > 0) {
      const line = this.table!.renderTitles();
      const moveTo = `\x1b[${width - line.length + 1}G`;
      stream.write(moveTo + line.line + '\n');
    }
  }

  #logSuite(suite: ReportTree<Leaf>, stream: NodeJS.WriteStream) {
    if (suite.node) {
      stream.write(indent(suite.depth) + suite.node + '\n');
    }

    for (const test of suite.items) {
      this.#logTest(test, suite.depth + 1, stream);
    }

    suite.children.forEach(suite => this.#logSuite(suite, stream));
  }

  #logTest(test: Leaf, indentLevel: number, stream: NodeJS.WriteStream) {
    const title = indent(indentLevel) + this.strategy.render(test);
    const renderedCells = this.table!.renderRow(test);

    if (renderedCells) {
      // move to terminal column to right-align the table
      const w = stream.columns;
      const moveTo = `\x1b[${w - renderedCells.length + 1}G`;

      stream.write(title + moveTo + renderedCells.line + '\n');
    } else {
      stream.write(title + '\n');
    }
  }

  #createTreeFrom(items: Iterable<Leaf>): ReportTree<Leaf> {
    const pathOf = this.strategy.pathOf;
    const root: ReportTree<Leaf> = { depth: 0, children: [], items: [], node: '' };

    for (const testResult of items) {
      let targetSuite = root;
      let depth = 1;

      // Find the target suite for this test, creating nested suites as necessary.
      for (const node of pathOf(testResult)) {
        let matchingSuite = targetSuite.children.find(s => s.node === node);

        if (!matchingSuite) {
          matchingSuite = { depth, children: [], items: [], node };
          targetSuite.children.push(matchingSuite);
        }

        targetSuite = matchingSuite;
        depth++;
      }

      targetSuite.items.push(testResult);
    }

    return root;
  }
}

function indent(n: number) {
  return '  '.repeat(n);
}
