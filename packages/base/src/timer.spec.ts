import * as timer from './timer.js';
import * as q from './quantity.js';

describe('HrTime', () => {
  test('from', () => {
    const a = timer.HrTime.from(q.create('microsecond', 1.5));
    expect(Number(a)).toEqual(1500);

    const b = timer.HrTime.from(q.create('second', 1));
    expect(Number(b)).toEqual(1e9);

    const c = timer.HrTime.from(q.create('second', -1));
    expect(Number(c)).toEqual(-1e9);

    const d = timer.HrTime.from(q.create('second', 0));
    expect(Number(d)).toEqual(0);

    const e = timer.HrTime.from(q.create('nanosecond', 0.5));
    expect(Number(e)).toEqual(1);

    const f = timer.HrTime.from(q.create('nanosecond', 10.5));
    expect(Number(f)).toEqual(11);
  });

  test('toMicroseconds', () => {
    const a = timer.HrTime.toMicroseconds(1000n as timer.HrTime);
    expect(a).toEqual(1);

    const b = timer.HrTime.toMicroseconds(1100n as timer.HrTime);
    expect(b).toEqual(1.1);

    const c = timer.HrTime.toMicroseconds(-1100n as timer.HrTime);
    expect(c).toEqual(-1.1);
  });
});
