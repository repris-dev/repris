declare namespace jest {
  interface Matchers<R, T = {}> {
    toBeInRange(min: number, max: number): R;
  }
}
