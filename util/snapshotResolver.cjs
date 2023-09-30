/* Custom Jest snapshot file paths:
 * https://jestjs.io/docs/configuration#snapshotresolver-string
 */
module.exports = {
  // Resolves from test to snapshot path
  // e.g. .tsc/xxx.spec.ts => src/xxx.snap.ts
  resolveSnapshotPath(testPath, snapshotExtension) {
    return testPath
      .replace(/\.spec\.([tj]sx?)/, `${snapshotExtension}.$1`)
      .replace(/\/\.tsc\//, '/src/');
  },

  // Resolves from snapshot to test path
  resolveTestPath(snapshotFilePath, snapshotExtension) {
    return snapshotFilePath
      .replace(snapshotExtension, '.spec')
      .replace(/\/src\//, '/.tsc/');
  },

  // Example test path, used for preflight consistency check of the
  // implementation above
  testPathForConsistencyCheck: 'some/example.spec.js',
};
