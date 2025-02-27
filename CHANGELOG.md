## 0.10.0

- Replace Minimum Detectable Effect-size of the sampling distribution to a normality
  test as a measure of its suitability for snapshotting and/or an
  indication of the benchmark quality/experimental setup.

- sampling shortcut - use Average absolute deviation (AAD) instead of
  Quartile coefficient of dispersion (QCD) of the mode. This seems more reliable in
  practice. Use `shortcutThreshold` to configure the threshold.

- `@repris/base` - Introduce Shapiro-Wilk normality test
- `@repris/base` - Introduce Average absolute deviation

## 0.9.5

- `@repris/samplers` - TS support

## 0.9.4

- `@repris/jest` - TS support

## 0.9.3

- `@repris/base` - various array utils.

## 0.9.2

- [Fix] `@repris/jest` handle case where all collected samples are noisy.
- Introduce `bench.skip.each()` and `bench.only.each()`
- `@repris/base` Publish type declarations

## 0.9.1

- [Fix] `repris compare` NaNs in confidence intervals of samples with zero stderr. (#9)

## 0.9.0

- `repris compare` Use minimum detectable effect-sizes during testing (#8)
- Use median bootstrap for processing troves and sample rejection (#8) 

## 0.8.5

- `repris compare` - change default bootstrap resamples to 5000 from 2500
- disable minification for easier debugging

## 0.8.4

- `@repris/jest` config fix

## 0.8.3

- `@repris/jest` preset fix

## 0.8.2

- `@repris/jest` package description
- `@repris/jest` Dependency tidying.
- Package homepages

## 0.8.1

- `@repris/jest` package readme

## 0.8.0

Initial release