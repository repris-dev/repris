import * as random from '../random.js';
import * as assert from '../assert.js';

/**
 * Collects a sample of k items from a list S containing n items,
 * where n is either a very large or unknown number. Typically n
 * is large enough that the list doesn't fit into main memory.
 * 
 * Reference: 'Algorithm L' -  Li, Kim-Hung (1994). "Reservoir-Sampling
 *   Algorithms of Time Complexity O(n(1+log(N/n)))"
 */
export default class ReservoirSample<T>
{
  /** Observations in the sample */
  readonly values: T[] = [];

  /** Number of observations seen */
  count = 0;

  private sample1: random.Distribution;
  private sampleN: random.Distribution;

  /** Next (n'th) observation to store in the reservoir */
  private next!: number;
  private w!: number;

  constructor(
    public readonly capacity: number,
    rng: random.Generator = random.mathRand
  ) {
    this.sample1 = random.uniform(0, 1, rng);
    this.sampleN = random.uniform(0, capacity, rng);
    this.reset();
  }

  /** Sample size */
  N(): number {
    return Math.min(this.count, this.capacity);
  }

  /**
   * Add an observation to the sample
   * @returns whether a previous observation was displaced
   */
  push(val: T): boolean {
    const replace = this.count === this.next;

    if (replace) {
      // Replace a random observation
      const idx = Math.floor(this.sampleN());
      assert.bounds(this.values, idx);

      this.values[idx] = val;
      this.skip();
    } else if (this.count < this.capacity) {
      // Fill the reservoir to capacity
      this.values.push(val);
    }

    this.count++;
    return replace;
  }

  reset(): void {
    this.values.length = 0;
    this.count = 0;
    this.next = this.capacity;
    this.w = Math.exp(Math.log(this.sample1()) / this.capacity);
    this.skip();
  }

  private skip(): void {
    this.next += (Math.log(this.sample1()) / Math.log(1 - this.w) + 1) | 0;
    this.w *= Math.exp(Math.log(this.sample1()) / this.capacity);
  }
}
