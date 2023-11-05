import * as q from './quantity.js';

describe('time', () => {
  describe('formatter', () => {
    const oneM = 60 * 1000 * 1000;
    const oneH = 60 * 60 * 1000 * 1000;
    const oneD = 24 * 60 * 60 * 1000 * 1000;
    const oneS = 1000 * 1000;
    const oneMs = 1000;

    // prettier-ignore
    test('auto formats time', () => {
      const fmt = q.formatter('time', { maximumFractionDigits: 2 });
      const us = (n: number) => q.create('microsecond', n);

      expect(fmt.format(us(oneD + 2 * oneH + 1.2 * oneMs)))
        .toBe('1d 2h 1.2ms');

      expect(fmt.format(us(2 * oneM + 2 * oneS + 10 * oneMs)))
        .toBe('2m 2.01s');

      expect(fmt.format(us(oneMs + 1)))
        .toBe('1ms');

      expect(fmt.format(us(2 * oneMs + 20)))
        .toBe('2.02ms');

      expect(fmt.format(us(1.5)))
        .toBe('1.5µs');

      expect(fmt.format(us(0.341)))
        .toBe('0.34µs');

      expect(fmt.format(us(-0.341)))
        .toBe('-0.34µs');

      expect(fmt.format(us(0)))
        .toBe('0');

      expect(fmt.format(us(-0)))
        .toBe('-0');

      expect(fmt.format(us(-1.5)))
        .toBe('-1.5µs');

      expect(fmt.format(us(0 - (2 * oneMs + 20))))
        .toBe('-2.02ms');

      expect(fmt.format(us(0 - (2 * oneM + 2 * oneS + 10 * oneMs))))
        .toBe('-2m 2.01s');
    });

    // prettier-ignore
    test('auto formats non-base time quantities', () => {
      const fmt = q.formatter('time', { maximumFractionDigits: 2 });

      expect(fmt.format(q.create('day', 1)))
        .toBe('1d');

      expect(fmt.format(q.create('day', 1.5)))
        .toBe('1d 12h');
    });
  });

  describe('conversion', () => {
    test('to', () => {
      const cvt = q.convert('minute');
      expect(cvt.to(2, 'millisecond').scalar).toBe(2 * 1000 * 60);
      expect(cvt.to(1, 'hour').scalar).toBe(1 / 60);

      expect(cvt.to(-2, 'millisecond').scalar).toBe(-(2 * 1000 * 60));
      expect(cvt.to(-1, 'hour').scalar).toBe(-(1 / 60));

      expect(cvt.to(0, 'second').scalar).toBe(0);
    });
  });
});
