/**
 * Built-in default map data (shared for all users).
 *
 * All `*.json` files in `default-data/` are bundled at build time (Vite glob).
 * Each file must be metro-multiverse export shape (userSubroutesFC + userStationsFC,
 * or legacy subroutesFC + stationsFC).
 *
 * Multiple files: first file (sorted by path) keeps IDs; later files get IDs
 * prefixed with the filename so r1 / s1 do not collide across exports.
 *
 * - subroutesFC.features[*].properties.route_kind is normalized to "default" on load
 * - users' local route edits are stored separately in localStorage
 * - deleted built-in routes: removedDefaultRouteIds + builtinDefaultsSuppressed in localStorage
 */

/** @type {Record<string, import('./routeModel.js').unknown>} */
const defaultDataModules = import.meta.glob("../../default-data/*.json", {
  eager: true,
  import: "default",
});

/**
 * @param {unknown} data
 * @returns {{ subroutes: object[], stations: object[] } | null}
 */
function extractRoutePayload(data) {
  if (!data || typeof data !== "object") return null;
  const subroutes =
    /** @type {object[] | undefined} */ (data.userSubroutesFC?.features) ??
    /** @type {object[] | undefined} */ (data.subroutesFC?.features);
  const stations =
    /** @type {object[] | undefined} */ (data.userStationsFC?.features) ??
    /** @type {object[] | undefined} */ (data.stationsFC?.features);
  if (!Array.isArray(subroutes) || !Array.isArray(stations)) return null;
  return { subroutes, stations };
}

/**
 * @param {string} path
 */
function filePrefixFromPath(path) {
  const base = path.split("/").pop()?.replace(/\.json$/i, "") ?? "data";
  const safe = base.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "data";
  return `${safe}_`;
}

/** @param {object} f */
function cloneFeature(f) {
  return JSON.parse(JSON.stringify(f));
}

/**
 * @param {object[]} subroutes
 * @param {object[]} stations
 * @param {string} prefix
 */
function applyIdPrefix(subroutes, stations, prefix) {
  /** @type {Map<string, string>} */
  const subMap = new Map();
  const newSubroutes = subroutes.map((f) => {
    const c = cloneFeature(f);
    const p = /** @type {Record<string, unknown>} */ (c.properties ?? {});
    c.properties = p;
    const oldSub = p.subroute_id;
    if (typeof oldSub === "string") {
      const newSub = `${prefix}${oldSub}`;
      subMap.set(oldSub, newSub);
      p.subroute_id = newSub;
    }
    if (typeof p.route_id === "string") p.route_id = `${prefix}${p.route_id}`;
    return c;
  });
  const newStations = stations.map((f) => {
    const c = cloneFeature(f);
    const p = /** @type {Record<string, unknown>} */ (c.properties ?? {});
    c.properties = p;
    if (typeof p.station_id === "string") p.station_id = `${prefix}${p.station_id}`;
    if (typeof p.subroute_id === "string") {
      p.subroute_id = subMap.get(p.subroute_id) ?? `${prefix}${p.subroute_id}`;
    }
    if (Array.isArray(p.transfer_routes)) {
      p.transfer_routes = p.transfer_routes.map((tr) =>
        typeof tr === "string" ? (subMap.get(tr) ?? `${prefix}${tr}`) : tr
      );
    }
    return c;
  });
  return { subroutes: newSubroutes, stations: newStations };
}

function mergeDefaultDataFromFolder() {
  const entries = Object.entries(defaultDataModules).sort(([a], [b]) => a.localeCompare(b));
  /** @type {object[]} */
  const allSubroutes = [];
  /** @type {object[]} */
  const allStations = [];
  /** @type {string[]} */
  const sources = [];

  if (entries.length === 0) {
    console.warn("[default-data] No JSON files in default-data/ — built-in routes will be empty.");
  }

  for (let i = 0; i < entries.length; i++) {
    const [path, data] = entries[i];
    const payload = extractRoutePayload(data);
    if (!payload) {
      console.warn(`[default-data] Skipped (missing route feature collections): ${path}`);
      continue;
    }

    let subroutes = payload.subroutes.map(cloneFeature);
    let stations = payload.stations.map(cloneFeature);
    const prefix = i === 0 ? "" : filePrefixFromPath(path);
    if (prefix) {
      ({ subroutes, stations } = applyIdPrefix(subroutes, stations, prefix));
    }

    allSubroutes.push(...subroutes);
    allStations.push(...stations);
    const name = path.split("/").pop();
    if (name) sources.push(name);
  }

  return { sources, subroutes: allSubroutes, stations: allStations };
}

const merged = mergeDefaultDataFromFolder();

/** Basenames of bundled default-data JSON files (build time). */
export const DEFAULT_DATA_FILE_NAMES = merged.sources;

export const DEFAULT_BUILTIN_MAP_DATA = {
  subroutesFC: { type: "FeatureCollection", features: merged.subroutes },
  stationsFC: { type: "FeatureCollection", features: merged.stations },
};
