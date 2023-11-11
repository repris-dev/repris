# Statistics of Repris

## Overcoming measurement bias

A typical benchmark runs software before and after modification in order to see whether its performance has changed. Then, the two sets of measurements, or samples, collected during this process are compared in a statistical [hypothesis test](https://en.wikipedia.org/wiki/Statistical_hypothesis_testing). In an ideal world this two-sample method would be sufficient and statistically sound approach to monitoring performance.

However, you might've noticed that if you run the same benchmark a number of times, perhaps one in five or more of those runs will produce results that diverge significantly from the others. There are several reasons this can happen.

Just-In-Time (JIT) compiled and garbage collected languages, such as JavaScript, are especially sensitive to factors external to the benchmark itself. One factor in particular is the use of dynamic profiling information which, due to small timing fluctuations, can alter the JIT compilation of the same piece of code. These small changes to code can cascade and lead to these changes to runtime performance from run to run [1, 4].

More generally these factors amount to a _measurement bias_ which, if unaccounted for, make it difficult or impossible to make claims about performance due to code modification, rather than other incidental factors. It also means benchmarks often can't be reproduced, even under identical conditions.

To mitigate this bias, Repris collects samples across multiple runs. Each run effectively samples from the space of possible JIT compilations of the same piece of code, introducing a kind of randomization to the experimental setup (a more explicit version of this technique is used by [stabilizer](https://github.com/ccurtsinger/stabilizer)).

Ultimately, 20-30 runs are usually sufficient to accurately detect a ~1% change in runtime performance.

## Non-parametric statistics

Many assumptions are made when benchmarking. These might include normality of measurements or fixed variance across runs. Usually these assumptions are made for convenience and compatibility with well-known statistical tests (e.g. t-tests) or summary statistics (e.g. the mean or median).

It's well known that benchmarks generally don't follow a normal distribution; this is sometimes side-stepped by more exotic distributions (e.g. log-normal, exponential). Some benchmarks may behave according to these assumptions, however this isn't generally true. In practice, benchmarks are very often multi-modal with variance changing across runs:

<p align="center">
  <img src="./distributions.svg" style="background-color: white">
</p>

Non-parametric statistics are unrestricted by assumptions concerning distributions, and Repris uses them where sensible for several reasons. A few are:

- There is no one distribution which can be applied to and work well across all benchmarks. Even when one distribution seems appropriate to a particular benchmark, it tends to describe a 'happy' state which fails to hold in challenging environments.

- Non-parametric statistics tend to be more robust in the presence of a large proportion of outliers (which we'll come to next.)

- Repris needs to provide sound and useful statistical feedback even with small sample sizes (n < 10) and being able to make fewer assumptions is better in such cases.

### Confidence intervals

By default, Repris computes [bootstrapped confidence intervals](https://en.wikipedia.org/wiki/Bootstrapping_(statistics)#Deriving_confidence_intervals_from_the_bootstrap_distribution) when running tests to report the sample quality.

When comparing samples, a [studentized bootstrap](https://olebo.github.io/textbook/ch/18/hyp_studentized.html) paired difference test is used determine whether a change in performance is statistically significant.

## Robust statistics

To mitigate against unreliable measurements caused by external interference, benchmarks should ideally be run on controlled, quiescent systems. This is usually inconvenient to do regularly without dedicated hardware.

Repris uses robust statistics to help ensure the reliability and validity of benchmark results, even in noisy environments like build servers and desktop machines.

### Point estimates

Benchmark tools typically report samples by their mean, median, minimum, percentiles and so on. Each summary statistic has its own advantages and drawbacks.

By default, Repris reports an estimate of the modal value. The mode is an ideal value of central tendency since it is the most probable value in the sample. The mode is generally unaffected by the shape of the distribution, especially its skew, making it naturally robust to extreme outliers.

In practice Repris uses the _Half-sample mode_ which has been shown to be robust to large proportion of outliers. [2, 3]

## References

[1] T. Mytkowicz, A. Diwan. _Producing Wrong Data Without Doing Anything Obviously Wrong!_ - ASPLOS’09, pp. 265–276. ACM (2009)

[2] D. Bickel _On a fast, robust estimator of the mode_ - Computational Statistics and Data Analysis, 50(12):3500-3530 (2006)

[3] T. Robertson, J. D. Cryer _An Iterative Procedure for Estimating the Mode_ - Journal of the American Statistical Association Vol. 69, No. 348 (1974)

[4] A. Georges et al. _Statistically Rigorous Java Performance Evaluation_ - OOPSLA’07 (2017)
