import * as iter from '../iterator.js';
import * as random from '../random.js';
import { ArrayView } from '../array.js';
import * as allPairs from './allPairs.js';

// qn: 0.2
const noisySample = [
  3.876e7, 4.032e7, 4.073e7, 4.138e7, 4.152e7, 4.198e7, 4.229e7, 4.289e7, 4.337e7, 4.482e7, 4.53e7,
  4.539e7, 4.546e7, 4.611e7, 4.635e7, 4.695e7, 4.696e7, 4.724e7, 4.747e7, 4.749e7, 4.791e7, 4.823e7,
  4.846e7, 4.879e7, 4.899e7, 4.915e7, 4.935e7, 4.976e7, 4.99e7, 5.033e7, 5.07e7, 5.181e7, 5.201e7,
  5.228e7, 5.237e7, 5.237e7, 5.27e7, 5.274e7, 5.284e7, 5.285e7, 5.292e7, 5.295e7, 5.305e7, 5.308e7,
  5.315e7, 5.344e7, 5.371e7, 5.375e7, 5.441e7, 5.454e7, 5.463e7, 5.511e7, 5.517e7, 5.538e7, 5.574e7,
  5.583e7, 5.607e7, 5.638e7, 5.652e7, 5.67e7, 5.673e7, 5.674e7, 5.681e7, 5.699e7, 5.709e7, 5.775e7,
  5.782e7, 5.812e7, 5.823e7, 5.828e7, 5.848e7, 5.897e7, 5.91e7, 5.955e7, 5.98e7, 5.989e7, 6.025e7,
  6.047e7, 6.106e7, 6.113e7, 6.187e7, 6.195e7, 6.195e7, 6.247e7, 6.308e7, 6.31e7, 6.349e7, 6.359e7,
  6.361e7, 6.368e7, 6.47e7, 6.472e7, 6.498e7, 6.522e7, 6.531e7, 6.562e7, 6.592e7, 6.593e7, 6.738e7,
  6.749e7, 6.768e7, 6.818e7, 6.838e7, 6.931e7, 6.941e7, 6.959e7, 6.992e7, 7.012e7, 7.072e7, 7.08e7,
  7.082e7, 7.096e7, 7.161e7, 7.235e7, 7.285e7, 7.296e7, 7.363e7, 7.451e7, 7.531e7, 7.553e7, 7.562e7,
  7.771e7, 7.778e7, 7.834e7, 8.093e7, 8.26e7, 8.719e7, 8.747e7,
];

const goodSample = [
  3.486e7, 3.488e7, 3.49e7, 3.491e7, 3.495e7, 3.499e7, 3.503e7, 3.503e7, 3.514e7, 3.523e7, 3.54e7,
  3.574e7, 3.575e7, 3.578e7, 3.579e7, 3.579e7, 3.581e7, 3.581e7, 3.583e7, 3.585e7, 3.588e7, 3.589e7,
  3.59e7, 3.591e7, 3.592e7, 3.592e7, 3.593e7, 3.593e7, 3.594e7, 3.594e7, 3.594e7, 3.594e7, 3.594e7,
  3.594e7, 3.595e7, 3.595e7, 3.596e7, 3.598e7, 3.598e7, 3.598e7, 3.599e7, 3.6e7, 3.6e7, 3.6e7,
  3.601e7, 3.601e7, 3.602e7, 3.602e7, 3.603e7, 3.605e7, 3.605e7, 3.606e7, 3.607e7, 3.607e7, 3.607e7,
  3.608e7, 3.608e7, 3.608e7, 3.609e7, 3.61e7, 3.61e7, 3.611e7, 3.611e7, 3.611e7, 3.611e7, 3.612e7,
  3.612e7, 3.613e7, 3.613e7, 3.614e7, 3.615e7, 3.615e7, 3.615e7, 3.616e7, 3.616e7, 3.616e7, 3.617e7,
  3.617e7, 3.617e7, 3.618e7, 3.619e7, 3.619e7, 3.621e7, 3.623e7, 3.624e7, 3.624e7, 3.625e7, 3.625e7,
  3.626e7, 3.627e7, 3.627e7, 3.627e7, 3.628e7, 3.628e7, 3.628e7, 3.629e7, 3.63e7, 3.631e7, 3.631e7,
  3.632e7, 3.633e7, 3.635e7, 3.636e7, 3.637e7, 3.638e7, 3.641e7, 3.643e7, 3.643e7, 3.644e7, 3.644e7,
  3.647e7, 3.648e7, 3.648e7, 3.65e7, 3.651e7, 3.653e7, 3.656e7, 3.656e7, 3.661e7, 3.664e7, 3.666e7,
  3.669e7, 3.669e7, 3.67e7, 3.672e7, 3.673e7, 3.68e7, 3.683e7, 3.688e7, 3.688e7, 3.689e7, 3.694e7,
  3.695e7, 3.696e7, 3.707e7, 3.711e7, 3.718e7, 3.729e7, 3.74e7, 3.743e7, 3.754e7, 3.758e7, 3.785e7,
  3.789e7, 3.792e7, 3.816e7, 3.826e7, 3.859e7, 3.897e7, 3.902e7, 3.925e7, 3.932e7, 3.981e7, 4.001e7,
  4.004e7, 4.03e7, 4.033e7, 4.034e7, 4.068e7, 4.076e7, 4.076e7, 4.126e7, 4.13e7, 4.148e7, 4.195e7,
  4.223e7, 4.272e7, 4.37e7, 4.4e7, 4.401e7, 4.402e7, 4.404e7, 4.407e7, 4.408e7, 4.414e7, 4.42e7,
  4.422e7, 4.425e7, 4.441e7, 4.445e7, 4.446e7, 4.455e7, 4.459e7, 4.466e7, 4.469e7, 4.479e7, 4.481e7,
  4.482e7, 4.483e7, 4.483e7, 4.483e7, 4.489e7, 4.52e7, 4.529e7, 4.582e7, 4.587e7, 4.725e7, 5.017e7,
];

function simpleSuite(analyse: (sample: ArrayView<number>) => allPairs.RobustScale) {
  test('3 observations', () => {
    const sample = [-2, -2, -2];
    const sn = analyse(sample);

    expect(sn.spread).toEqual(0);
  });

  test('2 observations', () => {
    const sample = [50, 52];
    const sn = analyse(sample);

    expect(sn.spread).toEqual(2);
  });

  test('1 observation', () => {
    const sample = [20];
    const sn = analyse(sample);

    expect(sn.spread).toEqual(0);
  });
}

describe('crouxSn', () => {
  simpleSuite(allPairs.crouxSn);

  test('5 observations', () => {
    const sample = [1, 2, 2, 3, 5];
    const sn = allPairs.crouxSn(sample);

    /*

        | 1  2  2  3  5  hi-med
      --|----------------------
      1 | 0  1  1  2  4    2
      2 | 1  0  0  1  3    1
      2 | 1  0  0  1  3    1
      3 | 2  1  1  0  2    2
      5 | 4  3  3  2  0    3
  
      lo-med = 2

    */
    expect(sn.spread).toEqual(2);
  });

  test('gaussian', () => {
    const entropy = random.PRNGi32(51);

    // mean=500, s.d.=100, n=500
    const sample1 = new Float32Array(iter.take(500, iter.gen(random.gaussian(500, 100, entropy))));

    const scale1 = allPairs.crouxSn(sample1);
    expect(scale1.correctedSpread).toBeInRange(99, 101);

    // mean=500, s.d.=1000, n=100
    const sample2 = new Float32Array(iter.take(100, iter.gen(random.gaussian(500, 1000, entropy))));

    const scale2 = allPairs.crouxSn(sample2);
    expect(scale2.correctedSpread).toBeInRange(950, 1050);

    // 2 samples mixed
    const sample12 = new Float32Array(iter.concat([sample1, sample2]));

    // expect a small s.d.
    const scale12 = allPairs.crouxSn(sample12);
    expect(scale12.correctedSpread).toBeInRange(100, 150);
  });
});

describe('crouxQn', () => {
  simpleSuite(allPairs.crouxQn);

  test('5 observations', () => {
    const sample = [1, 2, 2, 3, 5];
    const qn = allPairs.crouxQn(sample);

    /*

    pairs: 1  1  2  4  0  1  3  1  3  2
    sort:  0  1  1  1  1  2  2  3  3  4
                    ^  
    */
    expect(qn.spread).toEqual(1);
  });

  test('gaussian', () => {
    const entropy = random.PRNGi32(51);

    // mean=500, s.d.=100, n=500
    const sample1 = new Float32Array(iter.take(500, iter.gen(random.gaussian(500, 100, entropy))));

    const scale1 = allPairs.crouxQn(sample1);
    expect(scale1.correctedSpread).toBeInRange(99.5, 100.5);

    // mean=500, s.d.=1000, n=100
    const sample2 = new Float32Array(iter.take(100, iter.gen(random.gaussian(500, 1000, entropy))));

    const scale2 = allPairs.crouxQn(sample2);
    expect(scale2.correctedSpread).toBeInRange(975, 1025);

    // 2 samples mixed
    const sample12 = new Float32Array(iter.concat([sample1, sample2]));

    // expect a small s.d.
    const scale12 = allPairs.crouxQn(sample12);
    expect(scale12.correctedSpread).toBeInRange(100, 150);
  });
});
