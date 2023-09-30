import * as fs from 'fs/promises';

import { snapshots, wiretypes as wt } from '@repris/samplers';
import { assert, Status } from '@repris/base';

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
      const cacheFile = await this.loadCacheFile(cachePath, testPath);

      if (Status.isErr(cacheFile)) {
        return cacheFile;
      }

      snapshot = snapshots.Snapshot.fromJson(Status.get(cacheFile).snapshot);
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

    if (!snapshot.isEmpty()) {
      const cache: SnapshotFileWT = {
        suiteFilePath: meta.testPath,
        snapshot: snapshot.toJson(),
      };

      await fs.writeFile(meta.cachePath, JSON.stringify(cache));
    } else if (await pathExists(meta.cachePath)) {
      // delete any existing snapshot instead of writing an 'empty' snapshot
      await fs.unlink(meta.cachePath);
    }

    return Status.ok;
  }

  /** Delete any snapshot associated with the given path */
  async delete(testPath: string) {
    const cachePath = this.paths(testPath);
    await fs.unlink(cachePath);
  }

  private async loadCacheFile(cachePath: string, testFilePath: string) {
    let cache: SnapshotFileWT;

    try {
      cache = JSON.parse(await fs.readFile(cachePath, 'utf8')) as SnapshotFileWT;
    } catch (e) {
      return Status.err('Failed to load sample cache file: ' + (e as {}).toString());
    }

    // simple validation
    if (cache.suiteFilePath !== testFilePath) {
      return Status.err(
        `Invalid cache file for suite "${testFilePath}".\n` +
        `Cache file "${cachePath}" is associated with suite "${cache.suiteFilePath}".`
      );
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
