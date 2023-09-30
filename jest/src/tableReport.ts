import chalk from 'chalk';
import { assert, typeid } from '@sampleci/base';
import { wiretypes as wt, annotators as anno } from '@sampleci/samplers';
import type * as config from './config.js';

export interface ColumnQuality {
  id: typeid;
  thresholds?: number[];
}

export interface Column {
  id: typeid;
  displayName?: string;
  units?: string;
  grading?: { id: typeid; thresholds?: config.GradingConfig['thresholds'] };
}

export interface RenderedLine {
  line: string;
  length: number;
}

type Cell = string | readonly [text: string, len: number];

const Cell = {
  pad(c: Cell, columnWidth: number) {
    if (typeof c === 'string') {
      return c.padStart(columnWidth, ' ');
    }

    const [txt, width] = c;
    if (columnWidth > width) {
      return ' '.repeat(columnWidth - width) + txt;
    }

    return txt;
  },

  length(c: Cell) {
    return typeof c === 'string' ? c.length : c[1];
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

  fmt = new ValueFormatter();
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
    const cells = this.columns.map((c) => {
      const ann = bag.annotations.get(c.id);

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
      (w, i) => (this.columnWidths[i] = Math.max(w, Cell.length(cells[i])))
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
  private _colorizeByQuality(cell: Cell, config: ColumnQuality, bag: anno.AnnotationBag): Cell {
    const ann = bag.annotations.get(config.id);
    const colors = [chalk.green, chalk.yellow, chalk.red];

    if (typeof ann === 'number' && Array.isArray(config.thresholds)) {
      let k = -1;

      for (let t of config.thresholds) {
        if (ann >= t) {
          k++;
        } else {
          break;
        }
      }

      if (k >= 0 && k < colors.length) {
        return [colors[k](Cell.text(cell)), Cell.length(cell)];
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
      (c) => (c.displayName ?? c.id) + (c.units ? ` (${c.units})` : '')
    );
    this.columnWidths = this.titleCells.map((c) => c.length);
  }

  private _renderRow(cells: Cell[]): RenderedLine {
    assert.eq(cells.length, this.columns.length);

    const margin = ' '.repeat(this.colMargin);
    let row = [];
    let cols = 0;

    for (let i = 0; i < cells.length; i++) {
      const w = this.columnWidths[i];
      row.push(Cell.pad(cells[i], w));
      cols += w;
    }

    return {
      line: row.join(margin),
      length: cols + (cells.length - 1) * this.colMargin,
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

class ValueFormatter {
  fmtInt = new Intl.NumberFormat(void 0, { maximumFractionDigits: 0 });
  fmtNumber = new Intl.NumberFormat(void 0, { maximumSignificantDigits: 2 });

  format(val: anno.Annotation): Cell {
    switch (typeof val) {
      case 'string':
        return val;

      case 'bigint':
        return this.fmtInt.format(val);

      case 'boolean':
        return val ? 'T' : 'F';

      case 'number':
        return Math.round(val) === val ? this.fmtInt.format(val) : this.fmtNumber.format(val);

      case 'object': {
        if (Array.isArray(val)) {
          let cell: Cell = [chalk.dim('['), 1],
            k = val.length;

          for (let i = 0; i < k; i++) {
            const subCell = this.format(val[i]);
            cell = Cell.join(cell, subCell);

            if (i < k - 1) {
              cell = Cell.join(cell, [chalk.dim(', '), 2]);
            }
          }

          return Cell.join(cell, [chalk.dim(']'), 1]);
        }

        // TODO - quantity unit conversions
        return this.format(val.quantity);
      }
    }

    assert.is(false, `Failed to format value ${val}`);
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
};

export class TableTreeReporter<Leaf> {
  table: TerminalReport<Leaf>;

  constructor(
    public readonly columns: Column[],
    private strategy: TreeStrategy<Leaf>
  ) {
    this.table = new TerminalReport(columns);
  }

  render(items: Leaf[], stream: NodeJS.WriteStream) {
    const strat = this.strategy;

    items.forEach((item) => {
      const bag = strat.annotate(item);
      if (bag) {
        this.table.load(item, bag);
      }
    });

    const tree = this.createTreeFrom(items);

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

    suite.children.forEach((suite) => this.#logSuite(suite, stream));
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

  createTreeFrom(items: Leaf[]): ReportTree<Leaf> {
    const pathOf = this.strategy.pathOf;
    const root: ReportTree<Leaf> = { depth: 0, children: [], items: [], node: '' };
  
    items.forEach((testResult) => {
      let targetSuite = root;
      let depth = 1;
      
      // Find the target suite for this test, creating nested suites as necessary.
      for (const node of pathOf(testResult)) {
        let matchingSuite = targetSuite.children.find((s) => s.node === node);
  
        if (!matchingSuite) {
          matchingSuite = { depth, children: [], items: [], node };
          targetSuite.children.push(matchingSuite);
        }
  
        targetSuite = matchingSuite;
        depth++;
      }
  
      targetSuite.items.push(testResult);
    });
  
    return root;
  }
}


function indent(n: number) {
  return '  '.repeat(n);
}