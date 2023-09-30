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
      message: () => pass
        ? `Expected ${received} not to be in range (${min}, ${max})`
        : `Expected ${received} to be in range (${min}, ${max})`
    }
  }
});
