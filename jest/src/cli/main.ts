import { Command } from 'commander';
import * as jestConfig from 'jest-config';
import { Config } from '@jest/types';
import * as core from '@jest/core';
import Runtime from 'jest-runtime';

import { snapshotManager } from '@sampleci/samplers';
import { StagingAreaResolver } from '../snapshotUtils.js';
import { printf, println, eprintf, panic } from './util.js';

export function run(argv: string[] = process.argv) {
  const program = new Command();

  program
    .name('repris')
    .description('Repris CLI')
    .version('0.8.0');

  program.command('reset')
    .description('Clear the contents of the repris index')
    .option('--dryrun', 'display which fixtures will be removed', false)
    .action(async (options) => {
      reset(argv, options.dryrun)
    });

  program.parse(argv);
}

async function reset(argv: string[], dryRun?: boolean) {
  const jestArgv: Config.Argv = { $0: '', _: [] };
  const cfg = await jestConfig.readConfigs(jestArgv, [process.cwd()]);

  const projCfg = cfg.configs[0];
  const context = await Runtime.default.createContext(projCfg, {
    maxWorkers: 1,
    watchman: false,
  });

  const sfm = new snapshotManager.SnapshotFileManager(
    StagingAreaResolver(projCfg)
  );

  // test paths
  const search = new core.SearchSource(context);
  const tests = (await search.getTestPaths(cfg.globalConfig)).tests;
  const pending = [] as { testPath: string }[];

  for (const t of tests) {
    if (await sfm.exists(t.path)) {
      pending.push({ testPath: t.path });
    }
  }
}
