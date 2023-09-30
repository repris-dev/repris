expect.extend({
  toBeInRange(received, min, max) {
    if (typeof min !== 'number') {
      throw new Error('expected min to be a number');
    }

    if (typeof max !== 'number') {
      throw new Error('expected value to be a number');
    }

    if (max < min) {
      throw new Error('expected min <= max');
    }

    const pass = received >= min && received <= max;

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be in range (${min}, ${max})`
          : `Expected ${received} to be in range (${min}, ${max})`,
    };
  },

  toHaveValues(received, values) {
    if (typeof values[Symbol.iterator] !== 'function') {
      throw new Error('expected values to be iterable');
    }

    if (typeof received[Symbol.iterator] !== 'function') {
      throw new Error('expected received to be iterable');
    }

    let missing = undefined;

    for (const x of values) {
      let found = false;

      for (const y of received) {
        if (Object.is(x, y)) {
          found = true;
          break;
        }
      }

      if (!found) {
        missing = x;
        break;
      }
    }

    const pass = missing === undefined;

    return {
      pass,
      message: () =>
        pass
          ? `Expected received to not contain all values of (${values})`
          : `Expected received to contain (${missing})`,
    };
  },
});
