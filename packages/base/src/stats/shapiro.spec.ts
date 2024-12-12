import * as shapiro from './shapiro.js';

/**
 * The ground-truth values in this suite are derived from
 * scipy.stats.shapiro
 */

test('n=3', () => {
  expect(shapiro.shapiroWilk([1, 3, 5])).toEqual({ statistic: 1, pValue: 1 });

  {
    const r = shapiro.shapiroWilk([51, 5, 12]);

    expect(r.statistic).toBeCloseTo(0.861096, 5);
    expect(r.pValue).toBeCloseTo(0.27059, 4);
  }
});

test('n=5', () => {
  const r = shapiro.shapiroWilk([50512, 50101, 50221, 50241, 30410]);

  expect(r.statistic).toBeCloseTo(0.5684, 3);
  expect(r.pValue).toBeCloseTo(0.0002, 4);
});

test('n=7', () => {
  {
    const r = shapiro.shapiroWilk([50512, 50101, 50221, 50241, 30410]);

    expect(r.statistic).toBeCloseTo(0.5684, 3);
    expect(r.pValue).toBeCloseTo(0.0002, 4);
  }
  {
    const r = shapiro.shapiroWilk([0.14017859, -1.23009959, -0.92127891, 0.69604052, 1.92671868]);

    expect(r.statistic).toBeCloseTo(0.9522, 3.5);
    expect(r.pValue).toBeCloseTo(0.7529, 2.5);
  }
});

test('n=100', () => {
  {
    // lognorm
    // prettier-ignore
    const r = shapiro.shapiroWilk([
      0.43022615,  0.95012426,  0.70464284,  0.1562131 ,  3.40283613,
      2.11465598,  2.40163025,  0.33994001,  1.64480668,  6.05825508,
      8.4362114 ,  1.44449546,  1.46904785,  0.29448959,  0.6138275 ,
      1.5628673 ,  1.11617455,  1.94142846,  1.02156222,  4.85789901,
      3.31388058,  0.64553664,  0.2707609 ,  0.113239  ,  6.72528267,
      1.36644746,  1.11098452,  0.20529915,  1.05517166,  0.7859027 ,
      0.24156243,  1.03457458,  0.38425396,  2.96649841,  0.43391925,
      2.95860971,  4.14942944,  0.37475618,  0.65715432,  0.19423976,
      2.36027198,  5.4966025 ,  1.04708802,  1.69786847,  3.43258576,
      0.4780542 ,  0.30201118,  2.92926202,  0.95330859,  4.3394956 ,
      0.88304626,  0.99080629,  0.42583384,  0.87597069,  0.85814101,
      0.21936293,  0.81685843,  3.80038535,  3.20460812,  2.85786209,
      0.15163934,  0.10620145,  0.47714327,  0.81278541,  0.64697543,
      1.26176362,  1.55085374,  0.2631225 ,  1.55135347,  0.38763368,
      2.11727684,  0.10292192,  1.06092809,  1.26532527,  1.62010554,
      0.6555057 ,  4.18041511, 11.8811255 ,  6.15201445,  4.40843865,
      1.14807015,  0.91445034,  3.57975966,  3.7176895 ,  0.57653603,
      1.52013951,  0.76922583,  0.0829849 ,  1.99800953,  2.50412768,
      0.47407072,  0.24946626,  1.11546297,  1.41792675,  0.1354482 ,
      0.71911477,  0.54282566,  2.17151407,  1.00804411,  2.26749234,
    ]);

    expect(r.statistic).toBeCloseTo(0.750122, 4);
    expect(r.pValue).toBeCloseTo(9.432e-12, 4);
  }
  {
    // prettier-ignore
    const r = shapiro.shapiroWilk([
      -0.46556285,  1.96068783,  2.40751966, -0.5224367 ,  1.14612278,
      -1.56973594, -0.10854237, -0.03451555, -1.09225043,  0.67456159,
      -1.36583717, -0.28553598, -0.80930607,  0.75790328, -0.10224993,
      -0.38822025, -0.8108529 ,  2.29842106,  0.46597531, -0.02913109,
       0.38509064, -0.59692244, -0.50844245, -0.20363693, -1.21046845,
       2.27687652,  0.56343549, -0.24976451,  1.25138985,  0.04871198,
      -1.90762477,  0.47676008, -0.09859525,  1.76017796, -0.92648481,
      -0.77310095,  1.39727677,  0.45425955, -0.79626701,  1.05178907,
      -0.53932389, -0.10988894,  1.30709778,  0.95072673, -0.9011446 ,
       1.95824479,  0.260296  , -0.81286348, -0.50984943,  0.06394375,
      -0.92116203, -0.80880039, -0.57336068,  0.38188391, -0.85808115,
      -0.18584327, -1.60256804,  1.35579862,  1.42939736, -0.69975003,
      -0.42350266,  1.52123443, -0.66777949, -1.01199865,  1.4215073 ,
       0.35786333, -0.7873423 ,  0.64330262,  0.13155944,  1.9268128 ,
       0.9293564 ,  0.05595814, -1.91985572,  0.20758701, -0.56320582,
       0.6903989 , -0.42142384,  0.11684843, -0.29998097,  0.5933228 ,
       0.22373867, -1.48024082,  0.18265094,  0.4312379 ,  0.232156  ,
      -0.83939093, -1.1237321 ,  1.28294575,  0.09555338, -0.16227311,
      -0.40533743,  0.75057507,  0.3771761 , -0.80912383, -0.65017646,
       0.60618484, -1.88137377,  0.19308963,  0.68591336, -0.00961996,
    ]);

    expect(r.statistic).toBeCloseTo(0.98012, 4);
    expect(r.pValue).toBeCloseTo(0.13583, 4);
  }
});

test('repeated values', () => {
  {
    const r = shapiro.shapiroWilk([50512, 50101, 50221, 50241, 30410, 50221, 50221, 50241, 50221]);

    expect(r.statistic).toBeCloseTo(0.403549, 3.5);
    expect(r.pValue).toBeCloseTo(0, 4);
  }
});
