import { As, Status, typeid } from '@sampleci/base';

export type Units = string & As<'@units'>;
export const Units = '@units' as typeid;

export interface Converter {
  (scalar: number): number;
  (scalars: number[]): number[];

  from: Units;
  to: Units;
}

export interface Formatter {
  (scalar: number): string
}

export function unitsOf(expr: string): Status<Units> {
  return Status.err('Not implemented');
}

export function convert(from: Units, to: Units): Converter {
  throw Error('Not implemented');
}

export function format(units?: Units, opts?: Intl.NumberFormatOptions): Formatter {
  throw Error('Not implemented');
}
