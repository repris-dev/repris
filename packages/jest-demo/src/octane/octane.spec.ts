import { jest } from '@jest/globals'
import { random } from '@repris/base';

import { encrypt, decrypt } from './crypto.js';
import { setupNavierStokes, runNavierStokes, tearDownNavierStokes } from './navierStokes.js';
import { renderScene } from './raytrace.js';
import { runRegExpBenchmark } from './regexp.js';
import { runRichards } from './richards.js';
import { SplaySetup, SplayRun, SplayTearDown } from './splay.js';
import { deltaBlue } from './deltaBlue.js';
import { runEarlyBoyer } from './earlyBoyer.js';

let mockMathRand: jest.SpiedFunction<typeof Math.random>;

beforeEach(() => {
  mockMathRand = jest.spyOn(globalThis.Math, 'random').mockImplementation(
    random.uniform(0, 1, random.PRNGi32(41))
  );
});

afterEach(() => {
  mockMathRand.mockRestore();
})

bench('Delta blue', s => {
  for (const _ of s) deltaBlue();
});

bench('Early boyer', s => {
  for (const _ of s) runEarlyBoyer();
});

bench('Splay', s => {
  SplaySetup();
  for (const _ of s) SplayRun();
  SplayTearDown();
});

bench('Richards', s => {
  for (const _ of s) runRichards();
});

bench('Crypto', s => {
  for (const _ of s) {
    encrypt();
    decrypt();
  }
});

bench('Navier stokes', s => {
  setupNavierStokes();
  for (const _ of s) runNavierStokes();
  tearDownNavierStokes();
});

bench('Raytrace', s => {
  for (const _ of s) renderScene();
});

bench('Regexp', s => {
  for (const _ of s) runRegExpBenchmark();
});
