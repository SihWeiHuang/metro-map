/**
 * Lazy default-data loading (Phase 5).
 * Chunks are code-split; merged at bootstrap before store hydration.
 */
import { defaultDataChunkLoaders } from "../map/defaultData.js";
import {
  buildBundledDefaultRouteOrder,
  mergeDefaultDataEntries,
  toBuiltinMapData,
} from "./defaultDataMerge.js";

/** @type {{ subroutesFC: object, stationsFC: object } | null} */
let cachedBuiltin = null;
/** @type {string[]} */
let cachedFileNames = [];
/** @type {Map<string, number> | null} */
let cachedRouteOrder = null;
/** @type {Promise<{ subroutesFC: object, stationsFC: object }> | null} */
let loadPromise = null;

async function fetchAndMergeDefaultChunks() {
  const entries = Object.entries(defaultDataChunkLoaders).sort(([a], [b]) => a.localeCompare(b));
  const loaded = await Promise.all(
    entries.map(async ([path, loader]) => {
      const mod = await loader();
      const data = mod?.default ?? mod;
      return { path, data };
    }),
  );
  const merged = mergeDefaultDataEntries(loaded);
  cachedFileNames = merged.sources;
  cachedBuiltin = toBuiltinMapData(merged);
  cachedRouteOrder = buildBundledDefaultRouteOrder(cachedBuiltin);
  return cachedBuiltin;
}

/** Load all default-data chunks (parallel dynamic imports). Idempotent. */
export async function loadDefaultDataChunks() {
  if (cachedBuiltin) return cachedBuiltin;
  if (!loadPromise) loadPromise = fetchAndMergeDefaultChunks();
  return loadPromise;
}

export function getDefaultDataFileNames() {
  return [...cachedFileNames];
}

/** After `loadDefaultDataChunks()` / bootstrap — synchronous store hydration. */
export function getDefaultBuiltinMapDataSync() {
  if (!cachedBuiltin) {
    throw new Error("default-data not loaded — call loadDefaultDataChunks() during bootstrap");
  }
  return cachedBuiltin;
}

/** Default route list order (first-seen route_id per bundled default-data). */
export function getBundledDefaultRouteOrder() {
  if (!cachedRouteOrder) {
    if (!cachedBuiltin) return new Map();
    cachedRouteOrder = buildBundledDefaultRouteOrder(cachedBuiltin);
  }
  return cachedRouteOrder;
}
