const crypto = require('crypto');

Object.defineProperty(globalThis, 'crypto', {
  value: crypto,
});
