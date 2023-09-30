import * as crypto from 'crypto';
import { debug } from 'util';

import { Command } from 'commander';
import chalk from 'chalk';

import * as jestConfig from 'jest-config';
import { Config } from '@jest/types';
import * as core from '@jest/core';
import * as jReporters from '@jest/reporters';
import Runtime from 'jest-runtime';

import {
  snapshotManager,
  annotators,
  snapshots,
  wiretypes as wt,
  hypothesis,
  conflations,
} from '@repris/samplers';
import { Status, iterator, typeid, uuid } from '@repris/base';

import { IndexResolver, BaselineResolver } from '../snapshotUtils.js';
import { TableTreeReporter } from '../tableReport.js';
import * as reprisConfig from '../config.js';
import { gradedColumns } from '../reporterUtils.js';
import { println, panic, yesNoQuestion } from './util.js';

const dbg = debug('repris:cli');

export function run(argv: string[] = process.argv) {
  globalThis.crypto ??= {
    randomUUID() {
      return crypto.randomUUID() as any;
    },
  } as any;

  const program = new Command();

  program.name('repris').description('Repris CLI').version('0.8.0');

  program
    .command('reset')
    .description('Clears the contents of the repris index')
    .action(async _options => reset(argv));

  program
    .command('show')
    .description('Shows the snapshots and index for the repris project')
    .action(async _options => show(argv));

  program
    .command('compare')
    .description('Compare fixtures in the index to their snapshots')
    .action(async _options => compare(argv));

  program.parse(argv);
}

type IndexStat = {
  totalFixtures: number;
  totalSamples: number;
  files: IndexFileStat[];
};

type IndexFileStat = {
  testPath: string;
  fixtureCount: number;
  sampleCount: number;
  tombstoneCount: number;
};

async function reset(_argv: string[]) {
  const cfg = await jestConfig.readConfigs({ $0: '', _: [] }, [process.cwd()]);
  const projCfg = cfg.configs[0];
  const context = await Runtime.default.createContext(projCfg, {
    maxWorkers: 1,
    watchman: false,
  });

  const sfm = new snapshotManager.SnapshotFileManager(IndexResolver(projCfg));

  // test paths
  const search = new core.SearchSource(context);
  const testFiles = (await search.getTestPaths(cfg.globalConfig)).tests;

  // print the index
  const indexStat = await showIndexSummary(projCfg, testFiles, sfm);

  // Nothing to do if the index is empty
  if (indexStat.files.length === 0) {
    println('Index is empty.');
    return;
  }

  // ask permission
  const extra =
    indexStat.totalSamples > 0
      ? ` ${chalk.bold(indexStat.totalSamples)} samples will be lost.`
      : '';

  const doDelete: boolean | undefined = await yesNoQuestion(
    'Reset the index for these tests?' + extra
  );

  if (doDelete === true) {
    const p = indexStat.files.map(stat => sfm.delete(stat.testPath));
    await Promise.all(p);

    println('Index reset');
  } else {
    println('Exiting.');
  }
}

async function show(argv: string[]): Promise<void> {
  const cfg = await jestConfig.readConfigs({ $0: '', _: [] }, [process.cwd()]);
  const projCfg = cfg.configs[0];
  const context = await Runtime.default.createContext(projCfg, {
    maxWorkers: 1,
    watchman: false,
  });

  const baseline = new snapshotManager.SnapshotFileManager(await BaselineResolver(projCfg));
  const search = new core.SearchSource(context);
  const testFiles = (await search.getTestPaths(cfg.globalConfig)).tests;
  const reprisCfg = await reprisConfig.load(projCfg.rootDir);

  await showSnapshotDetail(projCfg, reprisCfg, testFiles, baseline);
}

async function compare(_argv: string[]): Promise<void> {
  const cfg = await jestConfig.readConfigs({ $0: '', _: [] }, [process.cwd()]);
  const projCfg = cfg.configs[0];
  const context = await Runtime.default.createContext(projCfg, {
    maxWorkers: 1,
    watchman: false,
  });

  const baseline = new snapshotManager.SnapshotFileManager(await BaselineResolver(projCfg));
  const indexm = new snapshotManager.SnapshotFileManager(await IndexResolver(projCfg));
  const search = new core.SearchSource(context);
  const testFiles = (await search.getTestPaths(cfg.globalConfig)).tests;
  const reprisCfg = await reprisConfig.load(projCfg.rootDir);

  await showComparison(projCfg, reprisCfg, testFiles, indexm, baseline);
}

type ComparedFixtures = {
  name: wt.FixtureName;
  annotations: annotators.AnnotationBag;
};

async function showComparison(
  projCfg: Config.ProjectConfig,
  reprisCfg: reprisConfig.SCIConfig,
  testFiles: jReporters.Test[],
  index: snapshotManager.SnapshotFileManager,
  baseline: snapshotManager.SnapshotFileManager
) {
  const annotationRequests = reprisConfig.annotationRequester(reprisCfg.comparison.annotations);
  const columns = gradedColumns(reprisCfg.comparison.annotations);
  const testRenderer = new TableTreeReporter<ComparedFixtures>(columns, {
    annotate: comparison => comparison.annotations,
    pathOf: comparison => comparison.name.title.slice(0, -1),
    render: comparison => chalk.dim(comparison.name.title.at(-1)),
  });

  for (const t of testFiles) {
    if (!(await index.exists(t.path)) || !(await baseline.exists(t.path))) continue;

    const [snapIndex, err1] = await index.loadOrCreate(t.path);
    const [snapBaseline, err2] = await baseline.loadOrCreate(t.path);

    if (err1) panic(err1);
    if (err2) panic(err2);

    const path = jReporters.utils.formatTestPath(projCfg, t.path);
    println(path);

    const comparisons = iterator.map(
      snapshots.joinSnapshotFixtures(snapIndex!, snapBaseline!),
      ([index, base]) => {
        const annotations = annotators.DefaultBag.from([]);

        let x0: conflations.DurationResult | undefined;
        let x1: conflations.DurationResult | undefined;

        // Load index samples and annotations
        if (index?.conflation?.annotations) {
          x0 = Status.get(
            conflations.DurationResult.fromJson(
              index.conflation.result,
              new Map(iterator.map(index.samples, ({ sample }) => [sample[uuid], sample]))
            )
          );

          const bag = annotators.DefaultBag.fromJson(index.conflation.annotations);
          applyMissingAnnotations(bag, annotationRequests('@index'), x0);
          annotations.union(bag, '@index');
        }

        // Load snapshot samples and annotations
        if (base?.conflation?.annotations) {
          x1 = Status.get(
            conflations.DurationResult.fromJson(
              base.conflation.result,
              new Map(iterator.map(base.samples, ({ sample }) => [sample[uuid], sample]))
            )
          );

          const bag = annotators.DefaultBag.fromJson(base.conflation.annotations);
          applyMissingAnnotations(bag, annotationRequests('@snapshot'), x1);
          annotations.union(bag, '@snapshot');
        }

        // run comparison
        if (x0 && x1) {
          const comparison = hypothesis.compare(x0, x1, annotationRequests('@test'));

          if (!Status.isErr(comparison)) {
            annotations.union(comparison[0].annotations, '@test');
          } else {
            dbg('Failed to compare conflations', comparison[1]);
          }
        }

        return {
          name: (index?.name ?? base?.name) as wt.FixtureName,
          annotations,
        };
      }
    );

    testRenderer.render(comparisons, process.stderr);
  }
}

function applyMissingAnnotations(
  bag: annotators.AnnotationBag,
  request: Map<typeid, any>,
  conflation: conflations.DurationResult
) {
  // A new request which excludes pre-existing annotations
  const filteredRequest = new Map(
    iterator.filter(request.entries(), anno => bag.annotations.get(anno[1]) === undefined)
  );

  if (filteredRequest.size > 0) {
    // the remaining request is the missing annotations
    const newBag = annotators.annotate(conflation, filteredRequest);
    if (Status.isErr(newBag)) {
      dbg('Failed to annotate conflation', newBag[1]);
      return;
    }

    bag.union(newBag[0]);
  }
}

async function showSnapshotDetail(
  projCfg: Config.ProjectConfig,
  reprisCfg: reprisConfig.SCIConfig,
  testFiles: jReporters.Test[],
  sfm: snapshotManager.SnapshotFileManager
) {
  const columns = gradedColumns(reprisCfg.conflation.annotations);

  const testRenderer = new TableTreeReporter<snapshots.AggregatedFixture<any>>(columns, {
    annotate(fixture) {
      if (fixture.conflation?.annotations) {
        return annotators.DefaultBag.fromJson(fixture.conflation.annotations);
      }
    },
    pathOf: fixture => fixture.name.title.slice(0, -1),
    render: fixture => chalk.dim(fixture.name.title.at(-1)),
  });

  for (const t of testFiles) {
    if (await sfm.exists(t.path)) {
      const [snapshot, err] = await sfm.loadOrCreate(t.path);

      if (err) panic(err);

      const path = jReporters.utils.formatTestPath(projCfg, t.path);
      println(path);

      const fixtures = iterator.collect(snapshot!.allFixtures(), []);
      testRenderer.render(fixtures, process.stderr);
    }
  }
}

async function showIndexSummary(
  projCfg: Config.ProjectConfig,
  testFiles: jReporters.Test[],
  sfm: snapshotManager.SnapshotFileManager
): Promise<IndexStat> {
  const pending = [] as IndexFileStat[];

  println('Repris Index Status\n');

  let totalFixtures = 0,
    totalSamples = 0;

  for (const t of testFiles) {
    if (await sfm.exists(t.path)) {
      const [snapshot, err] = await sfm.loadOrCreate(t.path);

      if (err) panic(err);

      let fixtureCount = 0;
      let sampleCount = 0;
      let tombstoneCount = 0;

      for (const fixture of snapshot!.allFixtures()) {
        fixtureCount++;
        sampleCount += fixture.samples.length;
      }

      for (const _ of snapshot!.allTombstones()) {
        tombstoneCount++;
      }

      if (fixtureCount > 0 || tombstoneCount > 0) {
        pending.push({ testPath: t.path, fixtureCount, sampleCount, tombstoneCount });
        totalFixtures += fixtureCount;
        totalSamples += sampleCount;
      }
    }
  }

  if (pending.length > 0) {
    const columns = [
      { type: 'fixtureStat' as typeid, displayName: 'Pending (samples)' },
      { type: 'tombstoneCount' as typeid, displayName: 'Captured' },
    ];

    const report = new TableTreeReporter<IndexFileStat>(columns, {
      annotate: stat => {
        const captured = stat.tombstoneCount / (stat.tombstoneCount + stat.fixtureCount);
        const ann = {
          fixtureStat:
            stat.fixtureCount === 0
              ? chalk.dim(`0 (0)`)
              : `${stat.fixtureCount} (${stat.sampleCount})`,
          tombstoneCount:
            stat.tombstoneCount === 0
              ? chalk.dim('0')
              : `${stat.tombstoneCount} (${(100 * captured).toFixed(0)}%)`,
        };
        return annotators.DefaultBag.fromJson(ann);
      },
      render: stat => jReporters.utils.formatTestPath(projCfg, stat.testPath),
      pathOf: () => [],
    });

    report.render(pending, process.stderr);
  }

  return {
    totalFixtures,
    totalSamples,
    files: pending,
  };
}

// TODO - rationalize config parsing
function createAnnotationRequest(
  annotations: (string | [id: string, config: reprisConfig.AnnotationConfig])[]
): Map<typeid, any> {
  return new Map(
    iterator.map(annotations, c => {
      const [id, conf] = reprisConfig.normalize.simpleOpt(c, {} as reprisConfig.AnnotationConfig);
      return [id as typeid, conf.options];
    })
  );
}
