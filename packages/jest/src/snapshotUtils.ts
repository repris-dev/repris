import HasteMap from 'jest-haste-map';
import { Config } from '@jest/types';
import { snapshotManager } from '@repris/samplers';

import { buildSnapshotResolver } from './snapshotResolver.js';

export function IndexResolver(config: Config.ProjectConfig): snapshotManager.PathResolver {
  const haste = HasteMap.default.getStatic(config);

  const resolver = (testFilePath: string) =>
    haste.getCacheFilePath(config.cacheDirectory, `sample-cache-${config.id}`, testFilePath);

  return resolver;
}

export async function BaselineResolver(
  config: Config.ProjectConfig,
): Promise<snapshotManager.PathResolver> {
  const resolver = await buildSnapshotResolver(config);
  return (testFilePath: string) => resolver.resolveSnapshotPath(testFilePath);
}
