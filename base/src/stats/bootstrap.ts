import { Indexable } from "../array.js";
import * as random from "../random.js";

export function resampler(
  sample: Indexable<number>,
  entropy = random.PRNGi32()
): () => Indexable<number> {
  const N = sample.length,
    rng = random.uniformi(0, N - 1, entropy),
    counts = new Int32Array(N),
    replicate = new Float64Array(N);

  return () => {
    counts.fill(0);
    for (let i = 0; i < N; i++) counts[rng()]++;

    for (let n = 0, i = 0; n < N; n++) {
      const x = sample[n];
      let k = counts[n];

      while (k-- > 0) {
        replicate[i++] = x;
      }
    }

    return replicate;
  };
}
