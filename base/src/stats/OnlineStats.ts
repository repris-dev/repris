export default class OnlineStats {
  #n = 0;
  #M1 = 0;
  #M2 = 0;
  #M3 = 0;
  #M4 = 0;

  N() { return this.#n; }

  mean() { return this.#n === 0 ? NaN : this.#M1; }

  std() { return Math.sqrt(this.#M2 / this.#n); }

  cov() { return this.std() / this.mean(); }

  skewness() { return Math.sqrt(this.#n) * this.#M3 / (this.#M2 ** 1.5); }

  kurtosis() { return (this.#n * this.#M4) / (this.#M2 * this.#M2) - 3; }

  push(x: number) {
    const n1 = this.#n;
    const n = ++this.#n;

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

  clone() {
    const s = new OnlineStats();

    s.#n = this.#n;
    s.#M1 = this.#M1;
    s.#M2 = this.#M2;
    s.#M3 = this.#M3;
    s.#M4 = this.#M4;

    return;
  }
}
