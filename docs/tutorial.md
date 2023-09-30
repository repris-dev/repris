# Getting Started

Install Repris on your Jest project with your favorite package manager:

```
npm install --save-dev @repris/jest
```

## Write a test

Lets say we have a hypothetical library with a function `fib(n)` which calculates the fibonacci number `n` in a [tail-recursive](https://en.wikipedia.org/wiki/Tail_call) fashion in file `index.js`:

```js
function fib(n, acc = 0, prev = 1) {
  if (n < 1) return acc;
  return fib(n - 1, prev + acc, acc);
}

exports.fib = fib;
```

First, we'll write a standard Jest test in `index.test.js`:

```js
const { fib } = require('./index');

test('fib(n)', () => {
  expect(fib(1)).toBe(1);
  expect(fib(2)).toBe(1);
  expect(fib(3)).toBe(2);
  expect(fib(30)).toBe(832040);
});
```

Then in `package.json` add a test script:

```json
{
  "scripts": {
    "test": "jest"
  }
}
```

Run the test with `npm test`. You should see:

<!--
<DIV STYLE="display:inline-block;white-space:pre;background-color:#222;font-family:Cascadia Code;Consolas;monospace;padding:8px;border:1px solid;"></SPAN><SPAN STYLE="color:#222;background-color:#98C379;"> PASS </SPAN><SPAN STYLE="color:#DCDFE4;"> </SPAN><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(n) (4 ms)<BR></SPAN></DIV>
-->

```
 PASS  index.test.js
  ✓ fib(n) (4 ms)
```

<BR>

So far, so ordinary.

## Write a benchmark

Now we'll add a simple benchmark to `index.test.js` for our `fib` function:

```js
bench('fib(500)', (state) => {
  let result = 0;

  // Repris will take a sample by iterating a number
  // of times.
  for (const _ of state) result = fib(500);

  // Finally check we got a sensible output
  expect(result).toBeGreaterThan(1);
});
```

To enable Repris, enable the `@repris/jest` [preset](https://jestjs.io/docs/configuration#preset-string) in `jest.config.js`:

```js
module.exports = {
  preset: '@repris/jest',
  testMatch: ['**/*.test.js'],
};
```

Re-run Jest like before with `npm test`:

<!--
<DIV STYLE="display:inline-block;white-space:pre;background-color:#222;font-family:Cascadia Code;Consolas;monospace;padding:8px;border:1px solid;"><SPAN STYLE="color:#222;background-color:#98C379;"> PASS </SPAN><SPAN STYLE="color:#DCDFE4;"> </SPAN><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>                                           Iter.   Mode  95% CI    Index<BR>  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(n)<BR></SPAN><SPAN STYLE="color:#DCDFE4;">  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(500)</SPAN><SPAN STYLE="color:#DCDFE4;">                              10,000  5.5µs    </SPAN><SPAN STYLE="color:#98C379;">0.1%  </SPAN><SPAN STYLE="color:#6E6F72;">- (1/1)</SPAN></DIV>
-->

```
 PASS  index.test.js
                                           Iter.   Mode  95% CI    Index
  ✓ fib(n)
  ✓ fib(500)                              10,000  5.5µs    0.1%  - (1/1)
```

<BR>

The test and benchmark ran. The report contains a summary of each sample that was collected from the benchmark:

- __Iter.__ - The number of iterations of `fib(500)`
- __Mode__ - The 'most likely' (modal) value of the sample
- __95% CI__ - A [Confidence interval](./statistics-of-repris.md#confidence-intervals) expressed as a % of the mode
- __Index__ - The status of the [trove](./concepts.md#troves) for this benchmark (explained later)

## Create a baseline

To increase accuracy, multiple samples should be collected. (See [The Statistics of Repris](./statistics-of-repris.md) for an explanation.) Running the tests again produces a new sample:

<!--
<DIV STYLE="display:inline-block;white-space:pre;background-color:#222;font-family:Cascadia Code;Consolas;monospace;padding:8px;border:1px solid;"><SPAN STYLE="color:#222;background-color:#98C379;"> PASS </SPAN><SPAN STYLE="color:#DCDFE4;"> </SPAN><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>                                       Iter.    Mode  95% CI       Index<BR>  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(n)<BR></SPAN><SPAN STYLE="color:#DCDFE4;">  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(500)</SPAN><SPAN STYLE="color:#DCDFE4;">                          10,000  4.56µs   </SPAN><SPAN STYLE="color:#E5C07B;">6.15%  </SPAN><SPAN STYLE="color:#6E6F72;">0.19 (2/2)</SPAN></DIV>
-->

```
 PASS  index.test.js
                                       Iter.    Mode  95% CI       Index
  ✓ fib(n)
  ✓ fib(500)                          10,000  4.56µs   6.15%  0.19 (2/2)
```

<BR>

The statistics are reported in the same way. You can also see the index summary has updated and shows:

```
0.19 (2/2)
```

This summary has two parts:
- `0.19` - A measure of the uncertainty of the trove collected so far. Ideally, we want this number to be as low as possible. As more samples are collected we should expect uncertainty to decrease.
- `(2/2)` - (The number of samples in the trove/Total number of runs of this benchmark). Eventually the worst samples get rejected once the trove is full.

Now lets run the benchmark another 20 times. Having to do this manually is a chore so we can use a bash command to help:

```bash
for i in {1..20}; do echo "# RUN $i"; npm test || break; done
```

The last run might look like this:

<!--
<DIV STYLE="display:inline-block;white-space:pre;background-color:#222;font-family:Cascadia Code;Consolas;monospace;padding:8px;border:1px solid;"><SPAN STYLE="color:#222;background-color:#98C379;"> PASS </SPAN><SPAN STYLE="color:#DCDFE4;"> </SPAN><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>                                     Iter.    Mode  95% CI         Index<BR>  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(n)<BR></SPAN><SPAN STYLE="color:#DCDFE4;">  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(500)</SPAN><SPAN STYLE="color:#DCDFE4;">                        10,000  4.48µs   </SPAN><SPAN STYLE="color:#98C379;">0.22%  </SPAN><SPAN STYLE="color:#DCDFE4;">0.00 (22/22)</SPAN></DIV>
-->

```
 PASS  index.test.js
                                     Iter.    Mode  95% CI         Index
  ✓ fib(n)
  ✓ fib(500)                        10,000  4.48µs   0.22%  0.00 (22/22)
```

<BR>

Notice that the trove uncertainty has dropped to 0 and become highlighted. This means this benchmark can now be snapshotted to be used as a baseline to compare against later.

The process of updating snapshots is the same as in Jest:

```bash
npm test --updateSnapshot
```

Repris will report that the snapshot was saved and the index was cleared:

<!--
<DIV STYLE="display:inline-block;white-space:pre;background-color:#222;font-family:Cascadia Code;Consolas;monospace;padding:8px;border:1px solid;"><SPAN STYLE="color:#DCDFE4;">Benchmark Run Summary<BR></SPAN><SPAN STYLE="color:#98C379;"> › All 1 benchmark snapshots updated. Index cleared.<BR><BR></SPAN><SPAN STYLE="color:#DCDFE4;"> Snapshots: 1 </SPAN><SPAN STYLE="color:#6E6F72;">(+1) </SPAN><SPAN STYLE="color:#DCDFE4;">updated<BR> Index:     0 stable, 0 </SPAN><SPAN STYLE="color:#6E6F72;">(-1) </SPAN><SPAN STYLE="color:#DCDFE4;">total</SPAN></DIV>
-->

```
Benchmark Run Summary
 › All 1 benchmark snapshots updated. Index cleared.

 Snapshots: 1 (+1) updated
 Index:     0 stable, 0 (-1) total
```

The `npx repris show` command shows the current state of the project which now contains the baseline:

```
src/index.test.js
                                       mode  Index    mode      Baseline
  fib(500)                                ?      ?  4.51µs  0.00 (22/22)
```

<BR>

## Change and compare

Next, we'll change our `fib` function to use an iterative version of the same algorithm:

```js
function fib(n) {
  let k = 0, k1 = 1;

  while (n > 0) {
    [k, k1] = [k1, k + k1];
    n--;
  }

  return k;
}
```

We want to know how the new implementation compares to the old one. We might expect it to be faster, but by how much? We'll run the benchmarks in the same way as before:

<!--
<DIV STYLE="display:inline-block;white-space:pre;background-color:#222;font-family:Cascadia Code;Consolas;monospace;padding:8px;border:1px solid;"><SPAN STYLE="color:#222;background-color:#98C379;"> PASS </SPAN><SPAN STYLE="color:#DCDFE4;"> </SPAN><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>                                    Iter.    Mode  95% CI          Index<BR>  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(n)<BR></SPAN><SPAN STYLE="color:#DCDFE4;">  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(500)</SPAN><SPAN STYLE="color:#DCDFE4;">                       10,000  2.71µs   </SPAN><SPAN STYLE="color:#98C379;">4.81%  </SPAN><SPAN STYLE="color:#DCDFE4;background-color:#222;">0.02 (30/50)</SPAN></DIV>
-->

```
 PASS  index.test.js
                                    Iter.    Mode  95% CI         Index
  ✓ fib(n)
  ✓ fib(500)                       10,000  2.71µs   4.81%  0.02 (30/50)
```

<BR>

Usually 20-40 runs are sufficient. On this occasion more were needed because shorter benchmarks typically have higher inter-sample variance. (See [Statistics of Repris](./statistics-of-repris.md) for reasons why.)

## Compare to baseline

We now have the baseline we collected earlier and the new pending snapshot in the index. Using `npx repris compare` we can compare them:

<!--
<DIV STYLE="display:inline-block;white-space:pre;background-color:#222;font-family:Cascadia Code;Consolas;monospace;padding:8px;border:1px solid;"><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>                                  Index        Change (99% CI)  Baseline<BR>  </SPAN><SPAN STYLE="color:#6E6F72;">fib(500)</SPAN><SPAN STYLE="color:#DCDFE4;">                       2.71µs  </SPAN><SPAN STYLE="color:#98C379;">-39.9% (-40.5, -39.1)    </SPAN><SPAN STYLE="color:#6E6F72;">4.51µs</SPAN></DIV>
-->

```
index.test.js
                                  Index        Change (99% CI)  Baseline
  fib(500)                       2.71µs  -39.9% (-40.5, -39.1)    4.51µs
```

<BR>

Repris reports that the iterative algorithm is 39.1% to 40.5% faster than the tail-recursive one!

## (Optional) Reset the index

Hypothetically if we're happy with the improvement, we can update the baseline again to correspond to the new implementation. Alternatively if we're not happy with the improvement (or if there wasn't one) we can reset the index with `npx repris reset`:

```
Repris Index Status:

                                                     Benchmarks  Samples
  index.test.js                                          1 of 1       30

Reset the index? 30 samples from 1 benchmarks will be lost. (y/n) y
Index reset
```

## Create a parameterized benchmark

To analyze the scalability of our algorithm we'll run the benchmark over a series of inputs of different sizes/magnitudes. We can do this with `bench.each()`, which works like Jest's [`test.each()`](https://jestjs.io/docs/api#testeachtablename-fn-timeout).

```js
bench.each([500, 1e3, 1e4])(`fib(%i)`, (state, n) => {
  let result = 0;
  for (const _ of state) result = fib(n);
  expect(result).toBeGreaterThan(1);
});
```

From this parameterized benchmark of `fib(n)` we create 3 benchmarks with different values of `n`:

```
 PASS  src/index.test.js
                                      Iter.     Mode  95% CI       Index
  ✓ fib(n)
  ✓ fib(500)                         10,000   4.66µs   3.22%  0.02 (3/3)
  ✓ fib(1000)                        10,000   8.62µs   4.62%  0.02 (3/3)
  ✓ fib(10000)                       10,000  84.51µs   4.22%  0.06 (3/3)
```

From the initial results we can see the algorithm has an approximately linear growth rate.
