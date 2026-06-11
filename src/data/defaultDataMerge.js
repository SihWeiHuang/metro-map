/**
 * Merge multiple metro-multiverse default-data JSON exports into one FC pair.
 * Shared by Vite lazy chunks (browser) and Node perf scripts.
 */

/**
 * @param {unknown} data
 * @returns {{ subroutes: object[], stations: object[] } | null}
 */
export function extractRoutePayload(data) {
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
export function filePrefixFromPath(path) {
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
export function applyIdPrefix(subroutes, stations, prefix) {
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
        typeof tr === "string" ? (subMap.get(tr) ?? `${prefix}${tr}`) : tr,
      );
    }
    return c;
  });
  return { subroutes: newSubroutes, stations: newStations };
}

/**
 * @param {Array<{ path: string, data: unknown }>} entries sorted by path
 * @returns {{ sources: string[], subroutes: object[], stations: object[] }}
 */
export function mergeDefaultDataEntries(entries) {
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
    const { path, data } = entries[i];
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

/**
 * @param {{ subroutes: object[], stations: object[] }} merged
 */
export function toBuiltinMapData(merged) {
  return {
    subroutesFC: { type: "FeatureCollection", features: merged.subroutes },
    stationsFC: { type: "FeatureCollection", features: merged.stations },
  };
}

/** @param {{ subroutesFC: { features: object[] } }} data */
export function buildBundledDefaultRouteOrder(data) {
  /** @type {Map<string, number>} */
  const order = new Map();
  let idx = 0;
  for (const f of data?.subroutesFC?.features ?? []) {
    const routeId = f.properties?.route_id;
    if (typeof routeId !== "string" || routeId === "" || order.has(routeId)) continue;
    order.set(routeId, idx++);
  }
  return order;
}
