import * as $samplers from './samplers.js';
import * as $samples from './samples.js';
import * as $conflations from './conflations.js';

export const samplers = {
  stopwatch: $samplers.defaults.stopwatch,
};

export const samples = {
  duration: $samples.defaults.duration,
};

export const conflations = {
  duration: $conflations.defaults.duration,
};
