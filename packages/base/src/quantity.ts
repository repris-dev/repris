import { isObject, typeid } from './util.js';

const BaseUnit = Symbol.for('@base-unit');

/**
 * All units, grouped by kinds. Each kind has a base unit which other units
 * in the same kind are relative to
 */
export const Taxonomy = {
  time: {
    [BaseUnit]: 'microsecond',
    nanosecond: ['ns', 0.001],
    microsecond: ['µs', 1],
    millisecond: ['ms', 1e3],
    second: ['s', 1e6],
    minute: ['m', 6e7],
    hour: ['h', 3.6e9],
    day: ['d', 8.64e10],
  },
  dimensionless: {
    percent: ['%', 100],
    count: ['n', 1],
  },
} satisfies Record<string, Record<string, [abbr: string, ratio: number]>>;

/** Each kind of unit */
export type Kind = keyof typeof Taxonomy;

/** Take the units of a given Kind */
export type UnitsOf<T extends Kind> = Extract<keyof (typeof Taxonomy)[T], string>;

/** All unit names */
export type Unit = UnitsOf<'time'> | UnitsOf<'dimensionless'>;

/** Unit in a value position */
export const Unit = '@units' as typeid;

/** A symbol to tag quantities with a unit */
export const UnitTag = Symbol.for('@unit');

/** A measurement with a unit */
export type Quantity = {
  readonly [UnitTag]: Unit;
  scalar: number;
};

/** A converter from one unit to another */
export interface Converter {
  readonly from: Unit;

  /** Convert the given scalar in 'from' units to the given 'to' units */
  to(scalar: number, to: Unit): Quantity;
}

/** Produce a string representation for given quantities */
export interface Formatter {
  format(quantity: Quantity): string;
}

export function create(unit: Unit, scalar: number): Quantity {
  return { [UnitTag]: unit, scalar };
}

/** Helper function to identify quantities */
export function isQuantity(q: any): q is Quantity {
  return isObject(q) && UnitTag in q;
}

/** Check the given unit is of the given kind */
export function isUnitOf<K extends Kind>(u: string, k: K): u is UnitsOf<K> {
  return k in Taxonomy && u in Taxonomy[k];
}

/** Get the kind of the given unit */
export function getKind(u: Unit): Kind | undefined {
  if (u in Taxonomy.time) return 'time';
  if (u in Taxonomy.dimensionless) return 'dimensionless';
  return undefined;
}

export function convert(from: Unit): Converter {
  switch (getKind(from)) {
    case 'time':
      return Time.convert(from as UnitsOf<'time'>);
  }

  throw new Error('Unknown Unit ' + from);
}

export function formatter(of?: Kind, opts?: Intl.NumberFormatOptions): Formatter {
  switch (of) {
    case 'time':
      return Time.formatter(opts);
    case 'dimensionless':
      return Dimensionless.formatter(opts);
    default:
      return DefaultFormatter(opts);
  }
}

function DefaultFormatter(opts?: Intl.NumberFormatOptions): Formatter {
  const fmt = new Intl.NumberFormat(void 0, opts);
  return {
    format(q: Quantity) {
      return fmt.format(q.scalar);
    },
  };
}

class Dimensionless {
  static formatter(opts = Time.defaultNumberFormatting): Formatter {
    const fmt = Intl.NumberFormat(void 0, opts);
    return {
      format(quantity: Quantity): string {
        if (!isUnitOf(quantity[UnitTag], 'dimensionless')) {
          throw new Error('Unknown Dimensionless unit');
        }

        if (quantity[UnitTag] === 'percent') {
          return fmt.format(quantity.scalar * Taxonomy.dimensionless.percent[1]) + '%';
        }

        return fmt.format(quantity.scalar);
      },
    };
  }
}

class Time {
  static convert(from: UnitsOf<'time'>): Converter {
    if (!(from in Taxonomy.time)) {
      throw new Error('Unknown unit of Time');
    }

    const toBase = Taxonomy.time[from][1];

    const cvt = {
      from,
      to(scalar: number, to: Unit) {
        let result = 0;

        if (to in Taxonomy.time) {
          const toMult = Taxonomy.time[to as UnitsOf<'time'>][1];
          result = (toBase * scalar) / toMult;
        }

        return {
          [UnitTag]: to,
          scalar: result,
        };
      },
    };

    return cvt;
  }

  static readonly defaultNumberFormatting: Intl.NumberFormatOptions = { maximumFractionDigits: 2 };

  static formatter(opts = Time.defaultNumberFormatting): Formatter {
    return Time.#autoFormatter(Intl.NumberFormat(void 0, opts));
  }

  static toBase(from: Quantity): number | undefined {
    const unit = from[UnitTag];
    return isUnitOf(unit, 'time') ? Taxonomy.time[unit][1] * from.scalar : undefined;
  }

  static #autoFmtIncrements: [suffix: string, ratio: number, terminal?: boolean][] = [
    Taxonomy.time.day,
    Taxonomy.time.hour,
    Taxonomy.time.minute,
    [...Taxonomy.time.second, true],
    [...Taxonomy.time.millisecond, true],
    [...Taxonomy.time.microsecond, true],
  ];

  /**  */
  static #autoFormatter(f: Intl.NumberFormat) {
    function format(quantity: Quantity) {
      let us = Time.toBase(quantity);

      // Conversion fail
      if (us === void 0) return 'ERR';

      // Special treatment
      if (Math.abs(us) < 1 || !Number.isFinite(us)) {
        return f.format(us) + (us === 0 ? '' : Taxonomy.time.microsecond[0]);
      }

      // Format negative durations as '-1m 3s' instead of '-1m -3s'
      let result = us < 0 ? '-' : '';
      us = Math.abs(us);

      // From largest to smallest ratios, stopping at the first 'terminal' ratio
      // with a significant value
      for (const [suffix, ratio, terminal] of Time.#autoFmtIncrements) {
        const incValue = us / ratio;
        const incValueFloored = Math.trunc(incValue);

        if (Math.abs(incValueFloored) > 0) {
          if (terminal) {
            result += f.format(incValue) + suffix + ' ';
            break;
          } else {
            result += f.format(incValueFloored) + suffix + ' ';
          }
        }

        us -= incValueFloored * ratio;
      }

      return result.trimEnd();
    }

    return {
      format,
    };
  }
}
