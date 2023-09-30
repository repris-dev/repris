import { assert, Status, typeid } from '@sampleci/base';
import { samples, wiretypes as wt, annotators as anno } from '@sampleci/samplers';
import chalk from 'chalk';

export interface ColumnQuality {
  id: typeid;
  thresholds: number[];
}

export interface Column {
  id: typeid;
  displayName?: string;
  units?: string;
  quality?: ColumnQuality;
};

export interface RenderedLine {
  line: string;
  length: number;
};

type Cell = string | readonly [text: string, len: number]

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

    return [
      at + bt,
      Cell.length(a) + Cell.length(b)
    ];
  },
}

export class TerminalReport<Id> {
  constructor(private columns: Column[]) { this.reset() }

  annotationRequest = this.columns.reduce(
    (req, c) => {
      req.set(c.id, {} /* options */);
      if (c.quality !== void 0) {
        req.set(c.quality.id, {} /* options */);
      }
      return req;
    },
    new Map<typeid, {}>()
  );

  fmt = new ValueFormatter();
  colMargin = 2;
  emptyCell = [chalk.dim('?'), 1] as Cell;
  rowIndex = new Map<Id, { cells: Cell[], duration: samples.Duration }[]>();
  columnWidths!: number[];
  titleCells!: string[];

  count() { return this.rowIndex.size; }

  /**
   * Load a sample in to the table.
   * Multiple samples can have the same id. When rendered, samples by the same id
   * are rendered in the order they were loaded in to the table.
   */
  load(rowid: Id, sample: wt.SampleData, conflation?: wt.SampleConflation): boolean {
    const d = samples.Duration.fromJson(sample);
    if (Status.isErr(d)) { return false; }

    // conflated stats
    const conflationAnnotations = anno.DefaultBag.fromJson(conflation?.annotations ?? {});
    const duration = d[0];

    // annotate the sample, create the cells for the row
    const [bag, err] = anno.annotate(duration, this.annotationRequest);

    if (err) {
      // Render as an empty row
      this.rowIndex.set(rowid, [{ cells: [], duration }]);  
    } else {
      const cells = this.columns.map(c => {
        const selectedBag = bag!.annotations.has(c.id) ? bag! : conflationAnnotations;
        const ann = selectedBag.annotations.get(c.id);

        if (ann !== undefined) {
          let cell = this.fmt.format(ann);
          if (c.quality !== void 0) {
            cell = this._colorizeByQuality(
              cell,
              c.quality,
              selectedBag,
            );
          }

          return cell;
        }
  
        // The annotation for this sample wasn't found 
        return this.emptyCell;
      });
  
      // update column widths
      this.columnWidths.forEach((w, i) =>
        this.columnWidths[i] = Math.max(w, Cell.length(cells[i]))
      );

      const entry = this.rowIndex.get(rowid) ?? []
      entry.push({ cells, duration });

      this.rowIndex.set(rowid, entry);
    }

    return true;
  }

  /**
   * @param cell The cell to colorize
   * @param config Configuration of the quality annotation
   * @param bag A bag of annotations containing the quality annotation
   */
  _colorizeByQuality(cell: Cell, config: ColumnQuality, bag: anno.AnnotationBag): Cell {
    const ann = bag.annotations.get(config.id);
    const colors = [chalk.green, chalk.yellow, chalk.red];

    if (typeof ann === 'number') {
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

    //  Either:
    //   - the annotation wasn't found
    //   - the annotation wasn't a number,
    //   - the number was outside the minimum thresholds of the
    //     quality config
    return cell;
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
      length: cols + ((cells.length - 1) * this.colMargin)
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
