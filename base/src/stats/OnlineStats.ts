import { Indexable } from '../array.js';
import { gt } from '../assert.js';
import { logNormal95 } from './intervals.js';

export interface SimpleSummary<T> {
  N(): T;

  mean(): T;

  mode(): T;

  std(): T;

  cov(): T;

  skewness(): T;

  kurtosis(): T;

  range(): [T, T];
}

export default class OnlineStats implements SimpleSummary<number> {
  #min = Infinity;
  #max = -Infinity;
  #n = 0;
  #M1 = 0;
  #M2 = 0;
  #M3 = 0;
  #M4 = 0;

  N() { return this.#n; }

  mean() { return this.#n === 0 ? NaN : this.#M1; }

  mode() { return this.mean(); }

  std() { return Math.sqrt(this.#M2 / this.#n); }

  var() { return this.#M2 / this.#n; }

  cov() { return this.std() / this.mean(); }

  skewness() { return Math.sqrt(this.#n) * this.#M3 / (this.#M2 ** 1.5); }

  kurtosis() { return (this.#n * this.#M4) / (this.#M2 * this.#M2) - 3; }

  range(): [number, number] { return [this.#min, this.#max]; }

  push(x: number) {
    const n1 = this.#n;
    const n = ++this.#n;

    this.#min = Math.min(this.#min, x)
    this.#max = Math.max(this.#max, x)

    const delta = x - this.#M1;
    const delta_n = delta / n;
    const delta_n2 = delta_n * delta_n;
    const term1 = delta * delta_n * n1;

    this.#M1 += delta_n;
    this.#M4 += term1 * delta_n2 * (n * n - 3 * n + 3) + 6 * delta_n2 * this.#M2 - 4 * delta_n * this.#M3;
    this.#M3 += term1 * delta_n * (n - 2) - 3 * delta_n * this.#M2;
    this.#M2 += term1;

    return n;
  }

  reset() {
    this.#n = this.#M1 = this.#M2 = this.#M3 = this.#M4 = 0;
    this.#min = Infinity;
    this.#max = -Infinity
  }

  toJson() {
    return { n: this.#n, m1: this.#M1, m2: this.#M2, m3: this.#M3, m4: this.#M4, min: this.#min, max: this.#max };
  }

  static fromJson(v: ReturnType<OnlineStats['toJson']>) {
    const stat = new OnlineStats();

    stat.#n = v.n;
    stat.#min = v.min;
    stat.#max = v.max;
    stat.#M1 = v.m1;
    stat.#M2 = v.m2;
    stat.#M3 = v.m3;
    stat.#M4 = v.m4;

    return stat;
  }

  static fromValues(sample: Indexable<number>) {
    const os = new OnlineStats();

    for (let i = 0; i < sample.length; i++) {
      os.push(sample[i]);
    }

    return os;
  }
}

/**
 * Reference:
 * https://en.wikipedia.org/wiki/Log-normal_distribution
 */
export class LognormalOnlineStats implements SimpleSummary<number> {
  s = new OnlineStats();

  N(): number { return this.s.N(); }

  mean(): number {
    return Math.exp(this.s.mean() + (this.s.var() / 2));
  }

  var(): number {
    const v = this.s.var();
    return (Math.exp(v) - 1) * Math.exp(2 * this.s.mean() + v);
  }

  std(): number {
    return Math.sqrt(this.var());
  }

  cov(): number {
    return Math.sqrt(Math.exp(this.s.var()) - 1);
  }

  skewness(): number {
    const v = Math.exp(this.s.var());
    return (v + 2) * Math.sqrt(v - 1);
  }

  kurtosis(): number {
    const s = this.s.var();
    return Math.exp(4 * s) + 2 * Math.exp(3 * s) + 3 * Math.exp(2 * s) - 6;
  }

  mode(): number {
    return Math.exp(this.s.mean() - this.s.var());
  }

  range(): [number, number] {
    const r = this.s.range();
    return [Math.exp(r[0]), Math.exp(r[1])];
  }

  push(x: number) {
    gt(x, 0);
    this.s.push(Math.log(x));
  }

  reset() {
    this.s.reset();
  }

  toJson() {
    return this.s.toJson();
  }

  /**
   * Margin of error
   * @param ddof - delta degrees of freedom
   */
  moe(ddof = 0) {
    const interval = logNormal95(this.s.mean(), this.s.std(), this.N() - ddof);
    return interval[1] - interval[0];
  }

  /**
   * Relative margin of error; the Margin of error expressed as a percentage
   * of the mean.
   */
  rme(ddof = 0) {
    return 100 * (this.moe(ddof) / this.mean());
  }

  static fromJson(v: ReturnType<LognormalOnlineStats['toJson']>) {
    const stat = new LognormalOnlineStats();
    stat.s = OnlineStats.fromJson(v);

    return stat;
  }

  static fromValues(sample: Indexable<number>) {
    const os = new LognormalOnlineStats();

    for (let i = 0; i < sample.length; i++) {
      os.push(sample[i]);
    }

    return os;
  }
}
