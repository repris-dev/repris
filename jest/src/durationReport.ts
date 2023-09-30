import { assert, Status, typeid } from '@sampleci/base';
import { samples, wiretypes as wt, annotators as anno } from '@sampleci/samplers';
import chalk from 'chalk';

export type Column = {
  id: typeid,
  displayName?: string,
  units?: string,
};

export type RenderedLine = { line: string, columns: number };

type Cell = string | readonly [cell: string, len: number]

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

  join(a: Cell, b: Cell): Cell {
    const at = typeof a === 'string' ? a : a[0];
    const bt = typeof b === 'string' ? b : b[0];

    return [
      at + bt,
      Cell.length(a) + Cell.length(b)
    ];
  }
}

export class TerminalReport<Id> {
  constructor(private columns: Column[]) { this.reset() }

  annotationRequest = this.columns.reduce(
    (req, c) => (req.set(c.id, {}), req), new Map<typeid, {}>()
  );

  fmt = new ValueFormatter();
  colMargin = 2;
  emptyCell = [chalk.dim('?'), 1] as Cell;
  rowIndex = new Map<Id, { cells: Cell[], duration: samples.Duration }>();
  columnWidths!: number[];
  titleCells!: string[];

  count() { return this.rowIndex.size; }

  /** Load a sample in to the table */
  load(rowid: Id, sample: wt.SampleData): boolean {
    const d = samples.Duration.fromJson(sample);
    if (Status.isErr(d)) { return false; }

    const duration = d[0];

    // annotate the sample, create the cells for the row
    const [as, err] = anno.annotate(duration, this.annotationRequest);

    if (err) {
      this.rowIndex.set(rowid, { cells: [], duration });  
    } else {
      const cells = this.columns.map(c => {
        for (const bag of as!) {
          const ann = bag.annotations.get(c.id);

          if (ann !== undefined) {
            return this.fmt.format(ann);
          }
        }
  
        // The annotation for this sample wasn't found 
        return this.emptyCell;
      });
  
      // update column widths
      this.columnWidths.forEach((w, i) =>
        this.columnWidths[i] = Math.max(w, Cell.length(cells[i]))
      );

      this.rowIndex.set(rowid, { cells, duration });
    }

    return true;
  }

  reset() {
    this.rowIndex.clear();
    this.titleCells = this.columns.map(
      c => (c.displayName ?? c.id) + (c.units ? ` (${ c.units })` : '')
    );
    this.columnWidths = this.titleCells.map(c => c.length);
  }

  _renderRow(cells: Cell[]): RenderedLine {
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
      columns: cols + ((cells.length - 1) * this.colMargin)
    };
  }

  renderTitles(): RenderedLine {
    return this._renderRow(this.titleCells);
  }

  renderRow(rowid: Id): RenderedLine {
    if (!this.rowIndex.has(rowid)) {
      return { line: '', columns: 0 };
    }

    return this._renderRow(this.rowIndex.get(rowid)!.cells);
  }
}

class ValueFormatter
{  
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
        return Math.round(val) === val
            ? this.fmtInt.format(val)
            : this.fmtNumber.format(val);

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
