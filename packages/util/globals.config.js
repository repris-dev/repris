/// <reference types="node" />

/**
 * @param {Object} packageJson
 * @return {Record<string, string>} Globals object
 */
export function defaults(packageJson) {
  return {
    __PKG_VERSION: JSON.stringify(packageJson.version),
    __DEBUG: process.env.MODE !== 'production',
  };
}
