import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { assert, Status } from '@repris/base';

import * as snapshots from './snapshot.js';
import * as wt from './wireTypes.js';

type SnapshotFileWT = {
  /** The suite which produced each run in this cache */
  suiteFilePath: string;

  /** Snapshot contents */
  snapshot: wt.Snapshot;
};

export type PathResolver = (testPath: string) => string;

/** File-based snapshot storage */
export class SnapshotFileManager {
  private activeSnapshots = new WeakMap<
    snapshots.Snapshot,
    { testPath: string; cachePath: string }
  >();

  constructor(private paths: PathResolver) {}

  async exists(testPath: string): Promise<boolean> {
    const cachePath = this.paths(testPath);
    return await pathExists(cachePath);
  }

  /** Load an existing snapshot for the given test path, or create a new one */
  async loadOrCreate(testPath: string): Promise<Status<snapshots.Snapshot>> {
    const cachePath = this.paths(testPath);
    let snapshot: snapshots.Snapshot | undefined;

    if (await pathExists(cachePath)) {
      // load an existing cache file
      const cacheFile = await this.loadCacheFile(cachePath);

      if (Status.isErr(cacheFile)) {
        return cacheFile;
      }

      try {
        const snapFile: SnapshotFileWT = Status.get(cacheFile);
        snapshot = snapshots.Snapshot.fromJson(snapFile.snapshot);
      } catch (e) {
        return Status.err(e as string);
      }
    } else {
      // begin a new cache file
      snapshot = new snapshots.Snapshot();
    }

    assert.is(snapshot !== undefined);
    this.activeSnapshots.set(snapshot, { testPath, cachePath });

    return Status.value(snapshot);
  }

  /** Write the given snapshot to disk. */
  async save(snapshot: snapshots.Snapshot): Promise<Status<unknown>> {
    const meta = this.activeSnapshots.get(snapshot);
    if (!meta) {
      return Status.err('Unknown Snapshot. Load the snapshot first.');
    }

    try {
      if (!snapshot.isEmpty()) {
        const cache: SnapshotFileWT = {
          suiteFilePath: meta.testPath,
          snapshot: snapshot.toJson(),
        };

        const dir = path.dirname(meta.cachePath);

        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(meta.cachePath, JSON.stringify(cache));
      } else if (await pathExists(meta.cachePath)) {
        // delete any existing snapshot instead of writing an 'empty' snapshot
        await fs.unlink(meta.cachePath);
      }
    } catch (e) {
      return Status.err(e as string);
    }

    return Status.ok;
  }

  /** Delete any snapshot associated with the given path */
  async delete(testPath: string) {
    const cachePath = this.paths(testPath);
    await fs.unlink(cachePath);
  }

  private async loadCacheFile(cachePath: string) {
    let cache: SnapshotFileWT;

    try {
      cache = JSON.parse(await fs.readFile(cachePath, 'utf8')) as SnapshotFileWT;
    } catch (e) {
      return Status.err('Failed to load sample cache file: ' + (e as {}).toString());
    }

    return Status.value(cache);
  }
}

async function pathExists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
