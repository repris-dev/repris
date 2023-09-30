import * as $samplers from './samplers.js';
import * as $samples from './samples.js';
import * as $digests from './digests.js';

export const samplers = {
  stopwatch: $samplers.defaults.stopwatch,
};

export const samples = {
  duration: $samples.defaults.duration,
};

export const digests = {
  duration: $digests.defaults.duration,
};
