declare namespace jest {
  interface Matchers<R, T = {}> {
    /** Expect a number to be in the range min to max inclusive */
    toBeInRange(min: number, max: number): R;
    toHaveValues(values: Iterable<any>): R;
  }
}
