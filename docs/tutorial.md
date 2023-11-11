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

Run the test with `npm jest`, you should see:

<DIV STYLE="display:inline-block;white-space:pre;background-color:#282C34;font-family:monospace;padding:4px;"><SPAN STYLE="color:#DCDFE4;background-color:#282C34;">&gt; jest<BR><BR></SPAN><SPAN STYLE="color:#282C34;background-color:#98C379;"> PASS </SPAN><SPAN STYLE="color:#DCDFE4;"> </SPAN><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(n) (4 ms)<BR></SPAN></DIV>

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

  // Check we got a sensible output
  expect(result).toBeGreaterThan(1);
});
```

To enable Repris, set the Jest [preset](https://jestjs.io/docs/configuration#preset-string) in `jest.config.js`:

```js
module.exports = {
  preset: '@repris/jest',
  testMatch: ['**/*.test.js'],
};
```

Run Jest as before with `npm test`:

<DIV STYLE="display:inline-block;white-space:pre;background-color:#282C34;font-family:monospace;font-size:12pt;padding:4px;"><SPAN STYLE="color:#282C34;background-color:#98C379;"> PASS </SPAN><SPAN STYLE="color:#DCDFE4;"> </SPAN><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>                                           Iter.   Mode  95% CI    Index<BR>  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(n)<BR></SPAN><SPAN STYLE="color:#DCDFE4;">  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(500)</SPAN><SPAN STYLE="color:#DCDFE4;">                              10,000  5.5µs    </SPAN><SPAN STYLE="color:#98C379;">0.1%  </SPAN><SPAN STYLE="color:#6E6F72;">- (1/1)</SPAN></DIV>

<BR>

The test and the benchmark ran. The report contains a summary of the sample that was collected:

- __Iter.__ - The number of iterations of `fib(30)`
- __Mode__ - The 'most likely' (modal) value of the sample
- __95% CI__ - A Confidence interval expressed as a % of the mode
- __Index__ - The status of the trove for this benchmark (explained later)

## Create a baseline

To increase accuracy during testing, multiple samples should be collected. (See [The Statistics of Repris](./statistics-of-repris.md) for more on this.) Running the tests again produces a new sample:

<DIV STYLE="display:inline-block;white-space:pre;background-color:#282C34;font-family:monospace;font-size:12pt;padding:4px;"><SPAN STYLE="color:#282C34;background-color:#98C379;"> PASS </SPAN><SPAN STYLE="color:#DCDFE4;"> </SPAN><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>                                       Iter.    Mode  95% CI       Index<BR>  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(n)<BR></SPAN><SPAN STYLE="color:#DCDFE4;">  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(500)</SPAN><SPAN STYLE="color:#DCDFE4;">                          10,000  4.56µs   </SPAN><SPAN STYLE="color:#E5C07B;">6.15%  </SPAN><SPAN STYLE="color:#6E6F72;">0.19 (2/2)</SPAN></DIV>

<BR>

Statistics are reported in the same way. You can also see the index summary has been updated:

```
0.19 (2/2)
```

This summary has two parts:
- `0.19` - A measure of the uncertainty of the trove collected so far. Ideally, we want this number to be as low as possible. As more samples are collected we should expect uncertainty to decrease.
- `(2/2)` - (The number of samples in the trove/Total number of runs of this benchmark)

Now we'll run the benchmark another 20 times. Having to do this manually is a chore so we can use a bash command to help:

```bash
for i in {1..20}; do echo "# RUN $i"; npm test || break; done
```

The last run might look like this:

<DIV STYLE="display:inline-block;white-space:pre;background-color:#282C34;font-family:monospace;font-size:12pt;padding:4px;"><SPAN STYLE="color:#282C34;background-color:#98C379;"> PASS </SPAN><SPAN STYLE="color:#DCDFE4;"> </SPAN><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>                                     Iter.    Mode  95% CI         Index<BR>  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(n)<BR></SPAN><SPAN STYLE="color:#DCDFE4;">  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(500)</SPAN><SPAN STYLE="color:#DCDFE4;">                        10,000  4.48µs   </SPAN><SPAN STYLE="color:#98C379;">0.22%  </SPAN><SPAN STYLE="color:#DCDFE4;">0.00 (22/22)</SPAN></DIV>

<BR>

Notice that the trove uncertainty has dropped to 0 and become highlighted. This means this benchmark can now be snapshotted to be used as a baseline to compare against later.

The process of updating snapshots is the same as in Jest:

```bash
npm test --updateSnapshot
```

Repris will report that the snapshot was saved and the index was cleared:

<DIV STYLE="display:inline-block;white-space:pre;background-color:#282C34;font-family:monospace;font-size:12pt;padding:4px;"><SPAN STYLE="color:#DCDFE4;">Benchmark Run Summary<BR></SPAN><SPAN STYLE="color:#98C379;"> › All 1 benchmark snapshots updated. Index cleared.<BR><BR></SPAN><SPAN STYLE="color:#DCDFE4;"> Snapshots: 1 </SPAN><SPAN STYLE="color:#6E6F72;">(+1) </SPAN><SPAN STYLE="color:#DCDFE4;">updated<BR> Index:     0 stable, 0 </SPAN><SPAN STYLE="color:#6E6F72;">(-1) </SPAN><SPAN STYLE="color:#DCDFE4;">total</SPAN></DIV>

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

We want to know how the new implementation compares to the old one. We expect it to be faster, but by how much? We'll run the benchmarks in the same way as before:

<DIV STYLE="display:inline-block;white-space:pre;background-color:#282C34;font-family:monospace;font-size:12pt;padding:4px;"><SPAN STYLE="color:#282C34;background-color:#98C379;"> PASS </SPAN><SPAN STYLE="color:#DCDFE4;"> </SPAN><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>                                    Iter.    Mode  95% CI          Index<BR>  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(n)<BR></SPAN><SPAN STYLE="color:#DCDFE4;">  </SPAN><SPAN STYLE="color:#98C379;">✓ </SPAN><SPAN STYLE="color:#6E6F72;">fib(500)</SPAN><SPAN STYLE="color:#DCDFE4;">                       10,000  2.71µs   </SPAN><SPAN STYLE="color:#98C379;">4.81%  </SPAN><SPAN STYLE="color:#DCDFE4;background-color:#282C34;">0.02 (30/100)</SPAN></DIV>

<BR>

Usually 20-40 runs are sufficient. This benchmark needed more because the implementations running faster than 2-4 microseconds are typically more sensitive to noise and have higher inter-sample variance.

## Compare to baseline

We now have the baseline we collected earlier and the new pending snapshot in the index. Using `npx repris compare` we can compare them:

<DIV STYLE="display:inline-block;white-space:pre;background-color:#282C34;font-family:monospace;font-size:12pt;padding:4px;"><SPAN STYLE="color:#6E6F72;"></SPAN><SPAN STYLE="color:#DCDFE4;">index.test.js<BR>                                  Index        Change (99% CI)  Baseline<BR>  </SPAN><SPAN STYLE="color:#6E6F72;">fib(500)</SPAN><SPAN STYLE="color:#DCDFE4;">                       2.71µs  </SPAN><SPAN STYLE="color:#98C379;">-39.9% (-40.5, -39.1)    </SPAN><SPAN STYLE="color:#6E6F72;">4.51µs</SPAN></DIV>

<BR>

Repris reports that the iterative algorithm is 39.1% to 40.5% faster than the tail-recursive one.

## Reset the index

Hypothetically if we're happy with the improvement, we can update the baseline (`--updateSnapshot`). Alternatively if we're not happy with the improvement (or if there wasn't one) we can reset the index:

```bash
$ npx repris reset

Repris Index Status:

                                                     Benchmarks  Samples
  index.test.js                                          1 of 1       30

Reset the index? 30 samples from 1 benchmarks will be lost. (y/n) y
Index reset
```

