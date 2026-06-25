/**
 * Store mutations, bootstrap, and shared route domain helpers.
 */
import { store } from "../data/metroStore.js";
import {
  PERSIST_STORAGE_KEY,
  ROUTE_KIND_DEFAULT,
  ROUTE_KIND_USER,
  ROUTE_STATUS_CONSTRUCTION,
  ROUTE_STATUS_CUSTOM,
  ROUTE_STATUS_OPERATING,
  ROUTE_STATUS_PLANNING,
} from "../data/routeConstants.js";
import { getDefaultBuiltinMapDataSync } from "../data/defaultDataLoader.js";
import { canonicalizeCountryId, canonicalizeRegion } from "../map/geoCatalog.js";
import { normalizeAllUserDefaultNames } from "../map/defaultNames.js";
import { clearSmoothLineDisplayCache } from "../map/displayLineSmoothing.js";
import { invalidateDisplayCache } from "../map-runtime/displayModel.js";
import { bumpGeometryRevision } from "./geometryRevisionBoundary.js";
import { schedulePersistToStorage } from "./persistenceAdapter.js";
import { clearDefaultLayer, clearUserLayer, syncMergedFromLayers } from "../data/storeLayers.js";

export const DISPLAY_ONLY_STATION_PROPS = ["label_anchor", "label_offset"];

const ROUTE_STATUS_VALUES = new Set([
  ROUTE_STATUS_OPERATING,
  ROUTE_STATUS_PLANNING,
  ROUTE_STATUS_CONSTRUCTION,
  ROUTE_STATUS_CUSTOM,
]);

export function normalizeStatus(value) {
  return ROUTE_STATUS_VALUES.has(value) ? value : ROUTE_STATUS_CUSTOM;
}

function addNumericIdToSet(set, id, pattern) {
  if (typeof id !== "string") return;
  const m = id.match(pattern);
  if (m) set.add(parseInt(m[1], 10));
}

/** 收集已使用的 r/g/s 數字（含編輯暫存）。 */
function collectUsedNumericIds() {
  const subroutes = new Set();
  const routes = new Set();
  const stations = new Set();
  for (const f of store.subroutesFC.features) {
    addNumericIdToSet(subroutes, f.properties?.subroute_id, /^r(\d+)$/);
    addNumericIdToSet(routes, f.properties?.route_id, /^g(\d+)$/);
  }
  for (const f of store.stationsFC.features) {
    addNumericIdToSet(stations, f.properties?.station_id, /^s(\d+)$/);
  }
  for (const session of store.temp.editingSessions || []) {
    addNumericIdToSet(subroutes, session?.subrouteId, /^r(\d+)$/);
  }
  for (const sid of store.temp.previewStations || []) {
    addNumericIdToSet(stations, sid, /^s(\d+)$/);
  }
  for (const q of store.temp.queuedStations || []) {
    addNumericIdToSet(stations, q?.station_id, /^s(\d+)$/);
  }
  return { subroutes, routes, stations };
}

function firstAvailableInSet(usedSet) {
  let n = 1;
  while (usedSet.has(n)) n++;
  return n;
}

function maxInSet(usedSet) {
  if (!usedSet.size) return 0;
  return Math.max(...usedSet);
}

/** 下一個編號優先填補空隙（例如已有 r1,r2,r5 → 下一條為 r3）。 */
function alignCounterToUsedIds(counterKey, usedSet) {
  const first = firstAvailableInSet(usedSet);
  const maxUsed = maxInSet(usedSet);
  const cur = store.counters[counterKey];
  if (cur < first || usedSet.has(cur) || cur > maxUsed) {
    store.counters[counterKey] = first;
  }
}

export function syncCountersFromLoadedFeatures() {
  const used = collectUsedNumericIds();
  alignCounterToUsedIds("subroute", used.subroutes);
  alignCounterToUsedIds("route", used.routes);
  alignCounterToUsedIds("station", used.stations);
}

export function deepCloneFC(fc) {
  if (!fc || !Array.isArray(fc.features)) return { type: "FeatureCollection", features: [] };
  return JSON.parse(JSON.stringify({ type: "FeatureCollection", features: fc.features }));
}

function normalizeBuiltinRoutesAsDefault(features) {
  for (const f of features) {
    if (!f.properties || typeof f.properties !== "object") f.properties = {};
    f.properties.route_kind = ROUTE_KIND_DEFAULT;
    if (typeof f.properties.country !== "string") f.properties.country = "";
    if (typeof f.properties.region !== "string") f.properties.region = "";
    f.properties.country = canonicalizeCountryId(f.properties.country);
    f.properties.region = canonicalizeRegion(f.properties.region);
    f.properties.status = normalizeStatus(f.properties.status);
  }
}

function getBundledDefaultRouteIds() {
  const ids = new Set();
  for (const f of getDefaultBuiltinMapDataSync()?.subroutesFC?.features ?? []) {
    const routeId = f.properties?.route_id;
    if (typeof routeId === "string" && routeId !== "") ids.add(routeId);
  }
  return ids;
}

function inferBuiltinDefaultsSuppressionFromRemovedIds() {
  if (store.builtinDefaultsSuppressed) return;
  const bundledIds = getBundledDefaultRouteIds();
  if (bundledIds.size === 0) return;
  if ([...bundledIds].every((id) => store.removedDefaultRouteIds.has(id))) {
    store.builtinDefaultsSuppressed = true;
  }
}

export function loadBuiltinDefaultState() {
  if (store.builtinDefaultsSuppressed) {
    clearDefaultLayer(store);
    syncCountersFromLoadedFeatures();
    return;
  }

  const builtin = getDefaultBuiltinMapDataSync();
  store.layers.default.subroutesFC = deepCloneFC(builtin?.subroutesFC);
  store.layers.default.stationsFC = deepCloneFC(builtin?.stationsFC);
  normalizeBuiltinRoutesAsDefault(store.layers.default.subroutesFC.features);
  syncMergedFromLayers(store);
  syncCountersFromLoadedFeatures();
}

export function applyRemovedDefaultRoutes() {
  if (!store.removedDefaultRouteIds?.size) return;

  const removed = store.removedDefaultRouteIds;
  /** @type {string[]} */
  const subrouteIdsToRemove = [];

  store.layers.default.subroutesFC.features = store.layers.default.subroutesFC.features.filter((f) => {
    const routeId = f.properties?.route_id;
    if (routeKindOf(f) !== ROUTE_KIND_DEFAULT || typeof routeId !== "string" || !removed.has(routeId)) {
      return true;
    }
    const subrouteId = f.properties?.subroute_id;
    if (typeof subrouteId === "string") subrouteIdsToRemove.push(subrouteId);
    return false;
  });

  if (!subrouteIdsToRemove.length) return;

  const removeSet = new Set(subrouteIdsToRemove);
  store.layers.default.stationsFC.features = store.layers.default.stationsFC.features.filter(
    (f) => !removeSet.has(f.properties?.subroute_id),
  );
  syncMergedFromLayers(store);
  for (const rid of subrouteIdsToRemove) {
    store.hiddenSubrouteIds.delete(rid);
  }
  syncCountersFromLoadedFeatures();
}

export function trackRemovedDefaultRoutes(routeIds) {
  const ids = Array.isArray(routeIds) ? routeIds : [routeIds];
  for (const routeId of ids) {
    if (typeof routeId !== "string" || routeId === "") continue;
    const isDefault = store.subroutesFC.features.some(
      (f) => f.properties?.route_id === routeId && routeKindOf(f) === ROUTE_KIND_DEFAULT
    );
    if (isDefault) store.removedDefaultRouteIds.add(routeId);
  }
}

/** @param {string} routeId */
export function routeGroupHasDefaultKind(routeId) {
  if (typeof routeId !== "string" || routeId === "") return false;
  return store.subroutesFC.features.some(
    (f) => f.properties?.route_id === routeId && routeKindOf(f) === ROUTE_KIND_DEFAULT
  );
}

/** After user mutation: move a whole route group from built-in default to user layer. */
export function promoteRouteGroupToUser(routeId) {
  if (typeof routeId !== "string" || routeId === "") return false;
  if (!routeGroupHasDefaultKind(routeId)) return false;
  trackRemovedDefaultRoutes(routeId);
  for (const f of store.subroutesFC.features) {
    if (f.properties?.route_id === routeId) f.properties.route_kind = ROUTE_KIND_USER;
  }
  updateBuiltinDefaultsSuppression();
  return true;
}

export function updateBuiltinDefaultsSuppression() {
  if (store.builtinDefaultsSuppressed) return;
  const hasDefaultLeft = store.subroutesFC.features.some((f) => routeKindOf(f) === ROUTE_KIND_DEFAULT);
  if (!hasDefaultLeft && store.removedDefaultRouteIds.size > 0) {
    store.builtinDefaultsSuppressed = true;
  }
}

export function readPersistedStorageRaw() {
  if (typeof localStorage === "undefined") return null;
  try {
    const rawV2 = localStorage.getItem(PERSIST_STORAGE_KEY);
    const rawV1 = localStorage.getItem("metro-map-data-v1");
    const raw = rawV2 ?? rawV1;
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export function loadPersistenceMetadata(data = readPersistedStorageRaw()) {
  if (!data) return;

  if (Array.isArray(data.removedDefaultRouteIds)) {
    store.removedDefaultRouteIds = new Set(
      data.removedDefaultRouteIds.filter((id) => typeof id === "string" && id !== "")
    );
  }
  if (data.builtinDefaultsSuppressed === true) {
    store.builtinDefaultsSuppressed = true;
  }
  inferBuiltinDefaultsSuppressionFromRemovedIds();

  if (Array.isArray(data.hiddenSubrouteIds)) {
    store.hiddenSubrouteIds = new Set(data.hiddenSubrouteIds);
  }
  if (data.counters && typeof data.counters === "object") {
    store.counters = { ...store.counters, ...data.counters };
  }
  if (data.settings && typeof data.settings === "object") {
    store.settings = { ...store.settings, ...data.settings };
  }
  store.settings.stationMinPerRoute = 0;
}

export function routeKindOf(feature) {
  const kind = feature?.properties?.route_kind;
  return kind === ROUTE_KIND_DEFAULT || kind === ROUTE_KIND_USER ? kind : ROUTE_KIND_USER;
}

export function isUserRouteFeature(feature) {
  return routeKindOf(feature) === ROUTE_KIND_USER;
}

export function isUserStationFeature(stationFeature) {
  const rid = stationFeature?.properties?.subroute_id;
  if (typeof rid === "string") {
    const route = store.subroutesFC.features.find((f) => f.properties?.subroute_id === rid);
    if (route && isUserRouteFeature(route)) return true;
  }
  const transferRoutes = stationFeature?.properties?.transfer_routes;
  if (Array.isArray(transferRoutes)) {
    return transferRoutes.some((tr) => {
      const route = store.subroutesFC.features.find((f) => f.properties?.subroute_id === tr);
      return route && isUserRouteFeature(route);
    });
  }
  return false;
}

export function normalizeUserDefaultNames() {
  normalizeAllUserDefaultNames(
    store.subroutesFC.features,
    store.stationsFC.features,
    isUserRouteFeature,
    isUserStationFeature
  );
  schedulePersistToStorage();
}

export function extractUserOnlyRoutes(routes) {
  return routes.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
}

export function extractUserStationsByRoutes(stations, userSubrouteIds) {
  return stations.filter((s) => {
    const rid = s?.properties?.subroute_id;
    if (userSubrouteIds.has(rid)) return true;
    const transferRoutes = s?.properties?.transfer_routes;
    return Array.isArray(transferRoutes) && transferRoutes.some((tr) => userSubrouteIds.has(tr));
  });
}

export function mergeUserStateIntoStore(userSubroutes, userStations) {
  const existingSubrouteIds = new Set(store.subroutesFC.features.map((f) => f.properties?.subroute_id));
  const existingRouteIds = new Set(store.subroutesFC.features.map((f) => f.properties?.route_id));
  const existingStationIds = new Set(store.stationsFC.features.map((f) => f.properties?.station_id));

  let subrouteCounter = store.counters.subroute;
  let routeCounter = store.counters.route;
  let stationCounter = store.counters.station;
  const nextSubroute = () => {
    while (existingSubrouteIds.has(`r${subrouteCounter}`)) subrouteCounter += 1;
    const id = `r${subrouteCounter++}`;
    existingSubrouteIds.add(id);
    return id;
  };
  const nextRoute = () => {
    while (existingRouteIds.has(`g${routeCounter}`)) routeCounter += 1;
    const id = `g${routeCounter++}`;
    existingRouteIds.add(id);
    return id;
  };
  const nextStation = () => {
    while (existingStationIds.has(`s${stationCounter}`)) stationCounter += 1;
    const id = `s${stationCounter++}`;
    existingStationIds.add(id);
    return id;
  };

  const subrouteIdMap = new Map();
  const routeIdMap = new Map();
  const mergedSubroutes = userSubroutes.map((f) => {
    const c = JSON.parse(JSON.stringify(f));
    const oldSubrouteId = c?.properties?.subroute_id;
    const oldRouteId = c?.properties?.route_id;
    const newSubrouteId = typeof oldSubrouteId === "string" && !existingSubrouteIds.has(oldSubrouteId) ? oldSubrouteId : nextSubroute();
    if (typeof oldSubrouteId === "string") subrouteIdMap.set(oldSubrouteId, newSubrouteId);
    if (typeof oldRouteId === "string") {
      if (!routeIdMap.has(oldRouteId)) {
        const mapped = !existingRouteIds.has(oldRouteId) ? oldRouteId : nextRoute();
        routeIdMap.set(oldRouteId, mapped);
        existingRouteIds.add(mapped);
      }
    }
    if (!c.properties || typeof c.properties !== "object") c.properties = {};
    c.properties.subroute_id = newSubrouteId;
    c.properties.route_id = typeof oldRouteId === "string" ? routeIdMap.get(oldRouteId) : nextRoute();
    c.properties.route_kind = ROUTE_KIND_USER;
    if (typeof c.properties.country !== "string") c.properties.country = "";
    if (typeof c.properties.region !== "string") c.properties.region = "";
    c.properties.country = canonicalizeCountryId(c.properties.country);
    c.properties.region = canonicalizeRegion(c.properties.region);
    c.properties.status = normalizeStatus(c.properties.status);
    return c;
  });

  const mergedStations = userStations.map((s) => {
    const c = JSON.parse(JSON.stringify(s));
    if (!c.properties || typeof c.properties !== "object") c.properties = {};
    const oldStationId = c.properties.station_id;
    c.properties.station_id =
      typeof oldStationId === "string" && !existingStationIds.has(oldStationId) ? oldStationId : nextStation();
    existingStationIds.add(c.properties.station_id);
    if (typeof c.properties.subroute_id === "string" && subrouteIdMap.has(c.properties.subroute_id)) {
      c.properties.subroute_id = subrouteIdMap.get(c.properties.subroute_id);
    }
    if (Array.isArray(c.properties.transfer_routes)) {
      c.properties.transfer_routes = c.properties.transfer_routes.map((rid) => subrouteIdMap.get(rid) || rid);
    }
    return c;
  });

  store.layers.user.subroutesFC.features.push(...mergedSubroutes);
  store.layers.user.stationsFC.features.push(...mergedStations);
  syncMergedFromLayers(store);
  if (mergedSubroutes.length) bumpRoutesGeometryRevision();
  syncCountersFromLoadedFeatures();
}

export function loadPersistedUserState() {
  const data = readPersistedStorageRaw();
  loadPersistenceMetadata(data);
  if (!data) return;

  try {
    const allSubroutes = Array.isArray(data.userSubroutesFC?.features)
      ? data.userSubroutesFC.features
      : Array.isArray(data.subroutesFC?.features)
        ? data.subroutesFC.features
        : [];
    const allStations = Array.isArray(data.userStationsFC?.features)
      ? data.userStationsFC.features
      : Array.isArray(data.stationsFC?.features)
        ? data.stationsFC.features
        : [];
    const userSubroutes = extractUserOnlyRoutes(allSubroutes);
    const userSubrouteIds = new Set(userSubroutes.map((f) => f?.properties?.subroute_id).filter((id) => typeof id === "string"));
    const userStations = extractUserStationsByRoutes(allStations, userSubrouteIds);
    mergeUserStateIntoStore(userSubroutes, userStations);
    syncCountersFromLoadedFeatures();
    normalizeAllSubroutesMetadata();
    normalizeUserDefaultNames();
  } catch {
    /* ignore corrupt storage */
  }
}

export function finishInitialRouteLoad() {
  if (!store.builtinDefaultsSuppressed) {
    applyRemovedDefaultRoutes();
  }
}
export function normalizeRouteProperties(p) {
  if (!p || typeof p !== "object") return;
  if (p.route_kind !== ROUTE_KIND_DEFAULT && p.route_kind !== ROUTE_KIND_USER) {
    p.route_kind = ROUTE_KIND_USER;
  }
  if (typeof p.country !== "string") p.country = "";
  if (typeof p.region !== "string") p.region = "";
  p.country = canonicalizeCountryId(p.country);
  p.region = canonicalizeRegion(p.region);
  p.status = normalizeStatus(p.status);
}

export function normalizeAllSubroutesMetadata() {
  for (const f of store.subroutesFC.features) {
    normalizeRouteProperties(f.properties);
  }
}

export const STATION_NAME_MAX_LEN = 15;
const NAME_MAX_LEN = STATION_NAME_MAX_LEN;

export function clampName15(v) {
  return String(v ?? "").slice(0, NAME_MAX_LEN);
}

export function syncRouteSubrouteMetadata(routeId, sourceProps) {
  const kind =
    sourceProps?.route_kind === ROUTE_KIND_DEFAULT || sourceProps?.route_kind === ROUTE_KIND_USER
      ? sourceProps.route_kind
      : ROUTE_KIND_USER;
  const country = canonicalizeCountryId(sourceProps?.country);
  const region = canonicalizeRegion(sourceProps?.region);
  const status = normalizeStatus(sourceProps?.status);
  store.subroutesFC.features.forEach((f) => {
    if (f.properties.route_id !== routeId) return;
    f.properties.route_kind = kind;
    f.properties.country = country;
    f.properties.region = region;
    f.properties.status = status;
  });
}
export function clearUserContent() {
  const userSubrouteIds = new Set(
    store.layers.user.subroutesFC.features.map((f) => f.properties.subroute_id).filter(Boolean),
  );
  clearUserLayer(store);
  userSubrouteIds.forEach((rid) => store.hiddenSubrouteIds.delete(rid));
  store.temp.editHiddenSubrouteIds.clear();
  store.temp.editSessionAddedHidden.clear();
  store.temp.editingSessions = [];
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  store.temp.subrouteIdEditing = null;
  syncCountersFromLoadedFeatures();
}
export function bumpRoutesGeometryRevision() {
  bumpGeometryRevision();
  clearSmoothLineDisplayCache();
  invalidateDisplayCache();
}

export function bootstrapMetro() {
  loadPersistenceMetadata();
  loadBuiltinDefaultState();
  loadPersistedUserState();
  finishInitialRouteLoad();
}

export function nextSubrouteId() {
  syncCountersFromLoadedFeatures();
  return `r${store.counters.subroute++}`;
}

export function nextRouteId() {
  syncCountersFromLoadedFeatures();
  return `g${store.counters.route++}`;
}

export function nextStationId() {
  syncCountersFromLoadedFeatures();
  return `s${store.counters.station++}`;
}

/** @typedef {{ userSubroutes: object[], userStations: object[], hiddenSubrouteIds: string[], removedDefaultRouteIds: string[], builtinDefaultsSuppressed: boolean, counters: object, settings: object }} UserStateSnapshot */
