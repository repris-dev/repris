import * as fs from 'fs/promises';

import { snapshots, wiretypes as wt } from '@sampleci/samplers';
import { assert, Status } from '@sampleci/base';

type SnapshotFileWT = {
  /** The suite which produced each run in this cache */
  suiteFilePath: string;

  /**  */
  snapshot: wt.Snapshot;
};

export type PathResolver = (testPath: string) => string;

export class SnapshotFileManager {
  private activeSnapshots = new WeakMap<
    snapshots.Snapshot,
    { testPath: string; cachePath: string }
  >();

  constructor(private paths: PathResolver) {}

  async loadOrCreate(testPath: string): Promise<Status<snapshots.Snapshot>> {
    const cachePath = this.paths(testPath);
    let snapshot: snapshots.Snapshot | undefined;

    try {
      await fs.access(cachePath);
    } catch {
      // begin a new cache file
      snapshot = new snapshots.Snapshot();
    }

    if (!snapshot) {
      // load an existing cache file
      const cacheFile = await this.loadCacheFile(cachePath, testPath);

      if (Status.isErr(cacheFile)) {
        return cacheFile;
      }

      snapshot = snapshots.Snapshot.fromJson(Status.get(cacheFile).snapshot);
    }

    assert.is(snapshot !== undefined);
    this.activeSnapshots.set(snapshot, { testPath, cachePath });
    return Status.value(snapshot);
  }

  async save(snapshot: snapshots.Snapshot) {
    const meta = this.activeSnapshots.get(snapshot);
    if (!meta) {
      return Status.err('Unknown Snapshot');
    }

    const cache: SnapshotFileWT = {
      suiteFilePath: meta.testPath,
      snapshot: snapshot.toJson(),
    };

    await fs.writeFile(meta.cachePath, JSON.stringify(cache));
    return Status.ok;
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
        `Invalid cache file, expected "${cachePath}", got "${cache.suiteFilePath}".`
      );
    }

    return Status.value(cache);
  }
}
