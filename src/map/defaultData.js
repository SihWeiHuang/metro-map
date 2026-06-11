/**
 * Built-in default map data chunk catalog (Vite lazy glob).
 *
 * All `*.json` files in `default-data/` are registered at build time.
 * Actual loading + merge happens in `src/data/defaultDataLoader.js` (Phase 5).
 *
 * Multiple files: first file (sorted by path) keeps IDs; later files get IDs
 * prefixed with the filename so r1 / s1 do not collide across exports.
 */

/** @type {Record<string, () => Promise<{ default?: unknown }>>} */
export const defaultDataChunkLoaders = import.meta.glob("../../default-data/*.json");

/** Sorted virtual paths of bundled default-data JSON (build time). */
export function listDefaultDataChunkPaths() {
  return Object.keys(defaultDataChunkLoaders).sort((a, b) => a.localeCompare(b));
}
