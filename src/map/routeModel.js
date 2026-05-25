import * as T from "@turf/turf";
import { t } from "../i18n/i18n.js";
import { getMap } from "./mapInstance.js";
import {
  buildStationDisplayCollections,
  featureCollectionWithSmoothedLineStrings,
  nearestPointOnSmoothedRoute,
  smoothLineStringForDisplay,
  tempLineFeaturesWithSmoothedGeometry,
} from "./displayLineSmoothing.js";
import { DEFAULT_BUILTIN_MAP_DATA } from "./defaultBuiltinData.js";
import { computeMapViewFromFeatures, normalizeImportedMapView } from "./mapGeoBounds.js";
import { scheduleImportMapView } from "./mapViewState.js";
import { setStationLabelBaseMask } from "./mapHoverFilters.js";
import { REGULAR_STATION_LAYER_FILTER, TRANSFER_STATION_LAYER_FILTER } from "./layers.js";
import {
  allocateDefaultRouteLabel,
  allocateDefaultStationLabel,
  normalizeAllUserDefaultNames,
  resolveRouteDisplayName,
  resolveRouteDisplayNameFromProps,
  resolveStationDisplayName,
  shouldClearRouteLabelOnRename,
  shouldClearStationLabelOnRename,
} from "./defaultNames.js";

/**
 * Terminology (user-facing):
 * - `route_id` in GeoJSON = 路線 (line)
 * - `subroute_id` in GeoJSON = 子路線 (sub-route)
 * JSON field names are kept for file compatibility.
 */

export const store = {
  subroutesFC: { type: "FeatureCollection", features: [] },
  stationsFC: { type: "FeatureCollection", features: [] },
  temp: {
    editingSessions: [],
    previewStations: [],
    /**
     * Queue "use existing station" actions during temp editing.
     * Currently used for linking new routes to existing fixed transfer stations
     * without creating a duplicate station.
     */
    queuedStations: [],
    subrouteIdEditing: null,
  },
  hiddenSubrouteIds: new Set(),
  counters: { subroute: 1, route: 1, station: 1 },
  settings: {
    stationMinPerRoute: 1,
  },
};

const PERSIST_STORAGE_KEY = "metro-map-data-v2";
const PERSIST_VERSION = 2;
export const EXPORT_FILE_FORMAT = "metro-map-x01";

const DISPLAY_ONLY_STATION_PROPS = ["label_anchor", "label_offset"];

/** 內建（免費展示）路線；未來由官方資料匯入時使用。 */
export const ROUTE_KIND_DEFAULT = "default";
/** 使用者自行繪製的路線（付費／編輯產生）。 */
export const ROUTE_KIND_USER = "user";

/** 路線營運狀態（路線層級，與 route_kind 分開）。 */
export const ROUTE_STATUS_OPERATING = "operating";
export const ROUTE_STATUS_PLANNING = "planning";
export const ROUTE_STATUS_CONSTRUCTION = "construction";
export const ROUTE_STATUS_CUSTOM = "custom";

const ROUTE_STATUS_VALUES = new Set([
  ROUTE_STATUS_OPERATING,
  ROUTE_STATUS_PLANNING,
  ROUTE_STATUS_CONSTRUCTION,
  ROUTE_STATUS_CUSTOM,
]);

function normalizeStatus(value) {
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

function syncCountersFromLoadedFeatures() {
  const used = collectUsedNumericIds();
  alignCounterToUsedIds("subroute", used.subroutes);
  alignCounterToUsedIds("route", used.routes);
  alignCounterToUsedIds("station", used.stations);
}

function deepCloneFC(fc) {
  if (!fc || !Array.isArray(fc.features)) return { type: "FeatureCollection", features: [] };
  return JSON.parse(JSON.stringify({ type: "FeatureCollection", features: fc.features }));
}

function normalizeBuiltinRoutesAsDefault() {
  for (const f of store.subroutesFC.features) {
    if (!f.properties || typeof f.properties !== "object") f.properties = {};
    if (f.properties.route_kind !== ROUTE_KIND_DEFAULT && f.properties.route_kind !== ROUTE_KIND_USER) {
      f.properties.route_kind = ROUTE_KIND_DEFAULT;
    }
    if (typeof f.properties.country !== "string") f.properties.country = "";
    if (typeof f.properties.region !== "string") f.properties.region = "";
    f.properties.status = normalizeStatus(f.properties.status);
  }
}

function loadBuiltinDefaultState() {
  const subroutesFC = deepCloneFC(DEFAULT_BUILTIN_MAP_DATA?.subroutesFC);
  const stationsFC = deepCloneFC(DEFAULT_BUILTIN_MAP_DATA?.stationsFC);
  store.subroutesFC = subroutesFC;
  store.stationsFC = stationsFC;
  normalizeBuiltinRoutesAsDefault();
  syncCountersFromLoadedFeatures();
}

function routeKindOf(feature) {
  const kind = feature?.properties?.route_kind;
  return kind === ROUTE_KIND_DEFAULT || kind === ROUTE_KIND_USER ? kind : ROUTE_KIND_USER;
}

function isUserRouteFeature(feature) {
  return routeKindOf(feature) === ROUTE_KIND_USER;
}

function isUserStationFeature(stationFeature) {
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

function normalizeUserDefaultNames() {
  normalizeAllUserDefaultNames(
    store.subroutesFC.features,
    store.stationsFC.features,
    isUserRouteFeature,
    isUserStationFeature
  );
  schedulePersistToStorage();
}

function extractUserOnlyRoutes(routes) {
  return routes.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
}

function extractUserStationsByRoutes(stations, userSubrouteIds) {
  return stations.filter((s) => {
    const rid = s?.properties?.subroute_id;
    if (userSubrouteIds.has(rid)) return true;
    const transferRoutes = s?.properties?.transfer_routes;
    return Array.isArray(transferRoutes) && transferRoutes.some((tr) => userSubrouteIds.has(tr));
  });
}

function mergeUserStateIntoStore(userSubroutes, userStations) {
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

  store.subroutesFC.features.push(...mergedSubroutes);
  store.stationsFC.features.push(...mergedStations);
  if (mergedSubroutes.length) bumpRoutesGeometryRevision();
  syncCountersFromLoadedFeatures();
}

function loadPersistedUserState() {
  if (typeof localStorage === "undefined") return;
  try {
    const rawV2 = localStorage.getItem(PERSIST_STORAGE_KEY);
    const rawV1 = localStorage.getItem("metro-map-data-v1");
    const data = rawV2 ? JSON.parse(rawV2) : rawV1 ? JSON.parse(rawV1) : null;
    if (!data || typeof data !== "object") return;

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

    if (Array.isArray(data.hiddenSubrouteIds)) {
      store.hiddenSubrouteIds = new Set(data.hiddenSubrouteIds);
    }
    if (data.settings && typeof data.settings.stationMinPerRoute === "number") {
      store.settings.stationMinPerRoute = data.settings.stationMinPerRoute;
    }
    syncCountersFromLoadedFeatures();
    normalizeAllSubroutesMetadata();
    normalizeUserDefaultNames();
  } catch {
    /* ignore corrupt storage */
  }
}

loadBuiltinDefaultState();
loadPersistedUserState();

let persistTimer = null;
function schedulePersistToStorage() {
  if (typeof localStorage === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const userSubroutes = store.subroutesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
      const userSubrouteIds = new Set(userSubroutes.map((f) => f.properties?.subroute_id));
      const userStations = extractUserStationsByRoutes(store.stationsFC.features, userSubrouteIds);
      const payload = {
        v: PERSIST_VERSION,
        userSubroutesFC: { type: "FeatureCollection", features: userSubroutes },
        userStationsFC: { type: "FeatureCollection", features: userStations },
        hiddenSubrouteIds: Array.from(store.hiddenSubrouteIds),
        counters: { ...store.counters },
        settings: { ...store.settings },
      };
      localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("metro-map: could not save map data", e);
    }
  }, 200);
}

const nextSubrouteId = () => {
  syncCountersFromLoadedFeatures();
  return `r${store.counters.subroute++}`;
};
const nextRouteId = () => {
  syncCountersFromLoadedFeatures();
  return `g${store.counters.route++}`;
};
const nextStationId = () => {
  syncCountersFromLoadedFeatures();
  return `s${store.counters.station++}`;
};
const TRANSFER_DEDUP_METERS = 4;

/** 游標與黃色吸附點距離 ≤ 此值（公尺）時視為「吸附」，可調整吸附強弱。 */
export const TRANSFER_SNAP_HOVER_METERS = 22;
/** 點擊路線時，與交叉吸附點距離 ≤ 此值（公尺）則改為新增轉乘站（略大於 hover 較好點）。 */
export const TRANSFER_SNAP_CLICK_METERS = 30;
/** 建立／整理轉乘站時，合併半徑內的一般站與路線端點站。 */
const TRANSFER_ABSORB_METERS = 10;
/** 視為同一重疊點的車站距離（公尺）。 */
const STATION_COINCIDENT_METERS = 2;

const NAME_MAX_LEN = 15;
function clampName15(v) {
  return String(v ?? "").slice(0, NAME_MAX_LEN);
}

function normalizeRouteProperties(p) {
  if (!p || typeof p !== "object") return;
  if (p.route_kind !== ROUTE_KIND_DEFAULT && p.route_kind !== ROUTE_KIND_USER) {
    p.route_kind = ROUTE_KIND_USER;
  }
  if (typeof p.country !== "string") p.country = "";
  if (typeof p.region !== "string") p.region = "";
  p.status = normalizeStatus(p.status);
}

function normalizeAllSubroutesMetadata() {
  for (const f of store.subroutesFC.features) {
    normalizeRouteProperties(f.properties);
  }
}

function syncRouteSubrouteMetadata(routeId, sourceProps) {
  const kind =
    sourceProps?.route_kind === ROUTE_KIND_DEFAULT || sourceProps?.route_kind === ROUTE_KIND_USER
      ? sourceProps.route_kind
      : ROUTE_KIND_USER;
  const country = typeof sourceProps?.country === "string" ? sourceProps.country : "";
  const region = typeof sourceProps?.region === "string" ? sourceProps.region : "";
  const status = normalizeStatus(sourceProps?.status);
  store.subroutesFC.features.forEach((f) => {
    if (f.properties.route_id !== routeId) return;
    f.properties.route_kind = kind;
    f.properties.country = country;
    f.properties.region = region;
    f.properties.status = status;
  });
}

export function findNearestTransferSnap(lngLat, maxMeters) {
  const fc = buildTransferSnapPointsFC();
  const pt = T.point([lngLat.lng, lngLat.lat]);
  let best = null;
  let bestD = Infinity;
  for (const f of fc.features) {
    const d = T.distance(pt, T.point(f.geometry.coordinates), { units: "meters" });
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  if (best && bestD <= maxMeters) return { feature: best, distanceMeters: bestD };
  return null;
}

/** 此交叉點是否已建立對應的固定轉乘站（兩條路線皆相符）。 */
export function isTransferSnapOccupied(snapFeature) {
  const c = snapFeature.geometry.coordinates;
  const ridA = snapFeature.properties.subroute_id_a;
  const ridB = snapFeature.properties.subroute_id_b;
  return store.stationsFC.features.some((s) => {
    if (!s.properties?.is_transfer_fixed) return false;
    const close = T.distance(T.point(s.geometry.coordinates), T.point(c), { units: "meters" }) <= 2;
    const routes = s.properties.transfer_routes || [];
    return close && routes.includes(ridA) && routes.includes(ridB);
  });
}

let routesGeometryRevision = 0;
let transferSnapCacheRevision = -1;
let transferSnapCacheFC = null;

function bumpRoutesGeometryRevision() {
  routesGeometryRevision++;
  transferSnapCacheRevision = -1;
  transferSnapCacheFC = null;
}

function buildTransferSnapPointsFC() {
  if (transferSnapCacheFC && transferSnapCacheRevision === routesGeometryRevision) {
    return transferSnapCacheFC;
  }

  const features = [];
  const seen = [];
  const routes = store.subroutesFC.features.filter((f) => f.geometry?.type === "LineString" && f.geometry.coordinates.length >= 2);
  const addSnapFeature = (coord, routeA, routeB, prefix) => {
    const isDup = seen.some((prev) => T.distance(T.point(prev), T.point(coord), { units: "meters" }) < TRANSFER_DEDUP_METERS);
    if (isDup) return;
    seen.push(coord);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coord },
      properties: {
        snap_id: `${prefix}_${routeA.properties.subroute_id}_${routeB.properties.subroute_id}_${features.length}`,
        subroute_id_a: routeA.properties.subroute_id,
        subroute_id_b: routeB.properties.subroute_id,
      },
    });
  };

  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i];
      const b = routes[j];
      const lineA = T.lineString(smoothLineStringForDisplay(a.geometry.coordinates));
      const lineB = T.lineString(smoothLineStringForDisplay(b.geometry.coordinates));
      const intersections = T.lineIntersect(lineA, lineB);

      intersections.features.forEach((pt) => {
        const c = pt.geometry.coordinates;
        addSnapFeature(c, a, b, "x");
      });

      const endpoints = [
        { route: a, other: b, coord: a.geometry.coordinates[0] },
        { route: a, other: b, coord: a.geometry.coordinates[a.geometry.coordinates.length - 1] },
        { route: b, other: a, coord: b.geometry.coordinates[0] },
        { route: b, other: a, coord: b.geometry.coordinates[b.geometry.coordinates.length - 1] },
      ];
      endpoints.forEach(({ route, other, coord }) => {
        const otherLine = route === a ? lineB : lineA;
        const snapped = T.nearestPointOnLine(otherLine, coord, { units: "meters" });
        if ((snapped.properties?.dist ?? Infinity) <= TRANSFER_ABSORB_METERS) {
          addSnapFeature(coord, route, other, "e");
        }
      });
    }
  }
  const fc = { type: "FeatureCollection", features };
  transferSnapCacheRevision = routesGeometryRevision;
  transferSnapCacheFC = fc;
  return fc;
}

function refreshTransferSnapSource() {
  const map = getMap();
  if (!map?.getSource("transfer-snaps")) return;
  map.getSource("transfer-snaps").setData(buildTransferSnapPointsFC());
}

/** Snapshot taken immediately before the most recent successful import. */
let lastImportUndoSnapshot = null;
let skipImportUndoInvalidate = false;
const importUndoListeners = new Set();

function notifyImportUndoListeners() {
  const available = lastImportUndoSnapshot != null;
  importUndoListeners.forEach((fn) => fn(available));
}

function subscribeImportUndoAvailability(listener) {
  importUndoListeners.add(listener);
  listener(lastImportUndoSnapshot != null);
  return () => importUndoListeners.delete(listener);
}

function captureUserStateSnapshot() {
  const userSubroutes = store.subroutesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
  const userSubrouteIds = new Set(userSubroutes.map((f) => f.properties?.subroute_id).filter((id) => typeof id === "string"));
  const userStations = extractUserStationsByRoutes(store.stationsFC.features, userSubrouteIds);
  return {
    userSubroutes: JSON.parse(JSON.stringify(userSubroutes)),
    userStations: JSON.parse(JSON.stringify(userStations)),
    hiddenSubrouteIds: Array.from(store.hiddenSubrouteIds).filter((id) => userSubrouteIds.has(id)),
    counters: { ...store.counters },
    settings: { ...store.settings },
  };
}

function restoreUserStateSnapshot(snapshot) {
  clearUserContent();
  if (snapshot.userSubroutes.length || snapshot.userStations.length) {
    mergeUserStateIntoStore(snapshot.userSubroutes, snapshot.userStations);
  }
  store.hiddenSubrouteIds = new Set(snapshot.hiddenSubrouteIds);
  store.counters = { ...snapshot.counters };
  store.settings = { ...snapshot.settings };
  syncCountersFromLoadedFeatures();
  normalizeAllSubroutesMetadata();
}

function canUndoLastImport() {
  return lastImportUndoSnapshot != null;
}

function undoLastImport() {
  if (!lastImportUndoSnapshot) return { ok: false };
  const snapshot = lastImportUndoSnapshot;
  lastImportUndoSnapshot = null;
  skipImportUndoInvalidate = true;
  try {
    restoreUserStateSnapshot(snapshot);
    refreshSources();
    const mapView = computeMapViewFromFeatures(snapshot.userSubroutes, snapshot.userStations);
    scheduleImportMapView(mapView);
    return { ok: true, mapView };
  } finally {
    skipImportUndoInvalidate = false;
    notifyImportUndoListeners();
  }
}

function buildTempEditFeatureCollections() {
  const tempLines = [];
  const tempNodes = [];

  store.temp.editingSessions.forEach((session) => {
    if (session.nodes.length >= 2) {
      tempLines.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: session.nodes },
        properties: { subroute_id: session.subrouteId },
      });
    }
    session.nodes.forEach((c, i) => {
      tempNodes.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: c },
        properties: { idx: i, subroute_id: session.subrouteId },
      });
    });
  });

  return {
    tempLineFC: {
      type: "FeatureCollection",
      features: tempLineFeaturesWithSmoothedGeometry(tempLines),
    },
    tempNodesFC: { type: "FeatureCollection", features: tempNodes },
  };
}

function refreshTempEditSources() {
  const map = getMap();
  if (!map) return;
  const { tempLineFC, tempNodesFC } = buildTempEditFeatureCollections();
  map.getSource("temp-edit-line") && map.getSource("temp-edit-line").setData(tempLineFC);
  map.getSource("temp-edit-nodes") && map.getSource("temp-edit-nodes").setData(tempNodesFC);
}

function refreshSources() {
  if (!skipImportUndoInvalidate && lastImportUndoSnapshot) {
    lastImportUndoSnapshot = null;
    notifyImportUndoListeners();
  }
  schedulePersistToStorage();

  const map = getMap();
  if (!map) return;
  const { stationsDisplayFC, stationLabelsFC } = buildStationDisplayCollections(store.stationsFC, store.subroutesFC);
  map.getSource("routes") &&
    map.getSource("routes").setData(featureCollectionWithSmoothedLineStrings(store.subroutesFC));
  map.getSource("stations") && map.getSource("stations").setData(stationsDisplayFC);
  map.getSource("station-labels") && map.getSource("station-labels").setData(stationLabelsFC);

  const { tempLineFC, tempNodesFC } = buildTempEditFeatureCollections();
  map.getSource("temp-edit-line") && map.getSource("temp-edit-line").setData(tempLineFC);
  map.getSource("temp-edit-nodes") && map.getSource("temp-edit-nodes").setData(tempNodesFC);

  const hiddenIds = Array.from(store.hiddenSubrouteIds);
  const visibleSubrouteIds = Array.from(
    new Set(store.subroutesFC.features.map((f) => f.properties.subroute_id).filter((rid) => !store.hiddenSubrouteIds.has(rid)))
  );
  const transferAnyVisibleExpr = visibleSubrouteIds.length
    ? ["any", ...visibleSubrouteIds.map((rid) => ["in", rid, ["coalesce", ["get", "transfer_routes"], ["literal", []]]])]
    : false;
  const stationVisibleFilter = ["any", ["in", ["get", "subroute_id"], ["literal", visibleSubrouteIds]], transferAnyVisibleExpr];
  const regularStationVisibleFilter = ["all", REGULAR_STATION_LAYER_FILTER, stationVisibleFilter];
  const transferStationVisibleFilter = ["all", TRANSFER_STATION_LAYER_FILTER, stationVisibleFilter];
  if (map.getLayer("stations-circle")) {
    map.setFilter("stations-circle", regularStationVisibleFilter);
  }
  if (map.getLayer("transfer-stations-circle")) {
    map.setFilter("transfer-stations-circle", transferStationVisibleFilter);
  }
  if (map.getLayer("stations-label")) {
    map.setFilter("stations-label", stationVisibleFilter);
  }
  if (map.getLayer("stations-label-move-frame")) {
    map.setFilter("stations-label-move-frame", stationVisibleFilter);
  }
  if (map.getLayer("routes-line")) {
    map.setFilter("routes-line", ["!", ["in", ["get", "subroute_id"], ["literal", hiddenIds]]]);
  }
}

function highlightRoute(subrouteId) {
  const map = getMap();
  if (!map) return;
  const route = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteId);
  const routeId = route ? route.properties.route_id : "";
  const hiddenIds = Array.from(store.hiddenSubrouteIds);

  if (map.getLayer("routes-line-hover")) {
    if (!routeId) {
      map.setFilter("routes-line-hover", ["==", ["get", "subroute_id"], ""]);
    } else {
      map.setFilter("routes-line-hover", [
        "all",
        ["==", ["get", "route_id"], routeId],
        ["!", ["in", ["get", "subroute_id"], ["literal", hiddenIds]]],
      ]);
    }
  }

  const subrouteIdsInRoute = routeId
    ? store.subroutesFC.features.filter((f) => f.properties.route_id === routeId).map((f) => f.properties.subroute_id)
    : [];
  const visibleSubrouteIdsInRoute = subrouteIdsInRoute.filter((rid) => !store.hiddenSubrouteIds.has(rid));
  const transferAnyMatchExpr = visibleSubrouteIdsInRoute.length
    ? ["any", ...visibleSubrouteIdsInRoute.map((rid) => ["in", rid, ["coalesce", ["get", "transfer_routes"], ["literal", []]]])]
    : false;
  const stationHoverFilter =
    visibleSubrouteIdsInRoute.length === 0
      ? ["==", ["get", "station_id"], ""]
      : ["any", ["in", ["get", "subroute_id"], ["literal", visibleSubrouteIdsInRoute]], transferAnyMatchExpr];

  map.getLayer("stations-circle-hover") &&
    map.setFilter("stations-circle-hover", ["all", REGULAR_STATION_LAYER_FILTER, stationHoverFilter]);

  map.getLayer("transfer-stations-circle-hover") &&
    map.setFilter("transfer-stations-circle-hover", ["all", TRANSFER_STATION_LAYER_FILTER, stationHoverFilter]);

  // Route-hover should highlight station labels too.
  // (Do NOT set this in refreshSources; it must remain hover-driven.)
  map.getLayer("stations-label-hover") &&
    map.setFilter("stations-label-hover", stationHoverFilter);
  setStationLabelBaseMask(map, visibleSubrouteIdsInRoute.length === 0 ? null : stationHoverFilter);
}

function clearHover() {
  const map = getMap();
  if (!map) return;
  map.getLayer("routes-line-hover") && map.setFilter("routes-line-hover", ["==", ["get", "subroute_id"], ""]);
  map.getLayer("stations-circle-hover") && map.setFilter("stations-circle-hover", ["==", ["get", "station_id"], ""]);
  map.getLayer("transfer-stations-circle-hover") &&
    map.setFilter("transfer-stations-circle-hover", ["==", ["get", "station_id"], ""]);
  map.getLayer("stations-label-hover") && map.setFilter("stations-label-hover", ["==", ["get", "station_id"], ""]);
  setStationLabelBaseMask(map, null);
}

function getRouteList() {
  const routes = {};
  store.subroutesFC.features.forEach((f) => {
    const p = f.properties;
    const rk =
      p.route_kind === ROUTE_KIND_DEFAULT || p.route_kind === ROUTE_KIND_USER ? p.route_kind : ROUTE_KIND_USER;
    const country = typeof p.country === "string" ? p.country : "";
    const region = typeof p.region === "string" ? p.region : "";
    const status = normalizeStatus(p.status);
    if (!routes[p.route_id]) routes[p.route_id] = [];
    routes[p.route_id].push({
      subroute_id: p.subroute_id,
      name: resolveRouteDisplayName(p.name, p.subroute_id, p.user_default_route_label),
      color: p.color || "#1e88e5",
      route_kind: rk,
      country,
      region,
      status,
    });
  });
  return Object.entries(routes).map(([route_id, subroutes]) => {
    const head = subroutes[0];
    return {
      route_id,
      subroutes,
      route_kind: head?.route_kind ?? ROUTE_KIND_USER,
      country: head?.country ?? "",
      region: head?.region ?? "",
      status: head?.status ?? ROUTE_STATUS_CUSTOM,
    };
  });
}

function getActiveEditRouteId() {
  if (!Array.isArray(store.temp.editingSessions) || store.temp.editingSessions.length === 0) return null;
  for (const session of store.temp.editingSessions) {
    if (!session?.subrouteId) continue;
    const route = store.subroutesFC.features.find((f) => f.properties?.subroute_id === session.subrouteId);
    if (route?.properties?.route_id) return route.properties.route_id;
  }
  return null;
}

function deleteSubroute(subroute_id) {
  store.subroutesFC.features = store.subroutesFC.features.filter((f) => f.properties.subroute_id !== subroute_id);
  store.stationsFC.features = store.stationsFC.features.filter((f) => f.properties.subroute_id !== subroute_id);
  store.hiddenSubrouteIds.delete(subroute_id);
  syncCountersFromLoadedFeatures();
  bumpRoutesGeometryRevision();
  refreshSources();
}

function deleteRoute(routeId) {
  const subrouteIdsInRoute = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId).map((f) => f.properties.subroute_id);

  if (subrouteIdsInRoute.length === 0) return;

  store.subroutesFC.features = store.subroutesFC.features.filter((f) => f.properties.route_id !== routeId);
  store.stationsFC.features = store.stationsFC.features.filter((f) => !subrouteIdsInRoute.includes(f.properties.subroute_id));
  subrouteIdsInRoute.forEach((rid) => store.hiddenSubrouteIds.delete(rid));
  syncCountersFromLoadedFeatures();
  bumpRoutesGeometryRevision();
  refreshSources();
}

function deleteRoutes(routeIds) {
  if (!Array.isArray(routeIds) || routeIds.length === 0) return;
  const idSet = new Set(routeIds);
  const subrouteIdsToDelete = store.subroutesFC.features
    .filter((f) => idSet.has(f.properties.route_id))
    .map((f) => f.properties.subroute_id);
  if (!subrouteIdsToDelete.length) return;

  store.subroutesFC.features = store.subroutesFC.features.filter((f) => !idSet.has(f.properties.route_id));
  store.stationsFC.features = store.stationsFC.features.filter((f) => !subrouteIdsToDelete.includes(f.properties.subroute_id));
  subrouteIdsToDelete.forEach((rid) => store.hiddenSubrouteIds.delete(rid));
  syncCountersFromLoadedFeatures();
  bumpRoutesGeometryRevision();
  refreshSources();
}

function setRouteHidden(routeId, hidden) {
  const subrouteIds = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId).map((f) => f.properties.subroute_id);
  if (!subrouteIds.length) return;
  subrouteIds.forEach((rid) => {
    if (hidden) store.hiddenSubrouteIds.add(rid);
    else store.hiddenSubrouteIds.delete(rid);
  });
  refreshSources();
  if (hidden) {
    clearHover();
  }
}

function isRouteHidden(routeId) {
  const subrouteIds = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId).map((f) => f.properties.subroute_id);
  if (!subrouteIds.length) return false;
  return subrouteIds.every((rid) => store.hiddenSubrouteIds.has(rid));
}

function startNewTempRoute() {
  store.hiddenSubrouteIds.clear();
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  store.temp.editingSessions = [{ subrouteId: null, nodes: [] }];
  refreshSources();
}

function startEditRoute(routeId) {
  const subroutesInRoute = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId);
  if (!subroutesInRoute.length) return;
  store.temp.editingSessions = [];
  store.temp.queuedStations = [];
  subroutesInRoute.forEach((route) => {
    store.temp.editingSessions.push({
      subrouteId: route.properties.subroute_id,
      nodes: route.geometry.coordinates.slice(),
    });
    store.hiddenSubrouteIds.add(route.properties.subroute_id);
  });
  refreshSources();
}

function endTempEditingAndCommit() {
  if (!store.temp.editingSessions || store.temp.editingSessions.length === 0) {
    return { ok: true, newRouteIds: [] };
  }

  const newSubrouteIdMap = new Map();
  const newRouteIds = [];

  store.temp.editingSessions.forEach((session) => {
    const { subrouteId, nodes } = session;
    if (nodes.length < 2) return;

    if (subrouteId) {
      const routeFeature = store.subroutesFC.features.find((x) => x.properties.subroute_id === subrouteId);
      if (!routeFeature) return;
      routeFeature.geometry.coordinates = nodes;
      const newLine = T.lineString(nodes);
      store.stationsFC.features.forEach((station) => {
        if (station.properties.subroute_id === subrouteId) {
          const snapped = T.nearestPointOnLine(newLine, station.geometry.coordinates);
          station.geometry.coordinates = snapped.geometry.coordinates;
        }
      });
    } else {
      const new_subroute_id = nextSubrouteId();
      const new_route_id = nextRouteId();
      const defaultRoute = allocateDefaultRouteLabel(store.subroutesFC.features, isUserRouteFeature);
      newSubrouteIdMap.set(session, new_subroute_id);
      newRouteIds.push(new_route_id);
      store.subroutesFC.features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: nodes },
        properties: {
          subroute_id: new_subroute_id,
          route_id: new_route_id,
          name: defaultRoute.name,
          user_default_route_label: defaultRoute.user_default_route_label,
          route_kind: ROUTE_KIND_USER,
          country: "",
          region: "",
          status: ROUTE_STATUS_CUSTOM,
        },
      });
      ensureEndpointStations(new_subroute_id, nodes);
    }
  });

  if (store.temp.previewStations && store.temp.previewStations.length) {
    store.temp.previewStations.forEach((sid) => {
      const st = store.stationsFC.features.find((f) => f.properties.station_id === sid);
      if (st) {
        let closestSubrouteId = null;
        let minDistance = Infinity;

        store.temp.editingSessions.forEach((session) => {
          if (session.nodes.length < 1) return;
          const line = T.lineString(session.nodes);
          const snapped = T.nearestPointOnLine(line, st.geometry.coordinates);
          if (snapped.properties.dist < minDistance) {
            minDistance = snapped.properties.dist;
            closestSubrouteId = session.subrouteId || newSubrouteIdMap.get(session);
          }
        });
        if (closestSubrouteId) st.properties.subroute_id = closestSubrouteId;
      }
    });
  }

  if (store.temp.queuedStations && store.temp.queuedStations.length) {
    store.temp.queuedStations.forEach((q) => {
      if (q?.kind !== "transfer-link") return;
      const st = store.stationsFC.features.find((f) => f.properties?.station_id === q.station_id);
      if (!st || !st.properties?.is_transfer_fixed) return;

      const subrouteId = q.session?.subrouteId || newSubrouteIdMap.get(q.session);
      if (!subrouteId) return;

      const next = new Set(st.properties.transfer_routes || []);
      next.add(subrouteId);
      st.properties.transfer_routes = Array.from(next);
    });
  }

  store.hiddenSubrouteIds.clear();
  store.temp.editingSessions = [];
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  normalizeAllTransferStations();
  syncCountersFromLoadedFeatures();
  normalizeUserDefaultNames();
  bumpRoutesGeometryRevision();
  refreshSources();
  return { ok: true, newRouteIds };
}

function cancelTempEditing() {
  const previewIds = new Set(store.temp.previewStations || []);
  store.stationsFC.features = store.stationsFC.features.filter((s) => {
    const sid = s.properties?.station_id;
    if (sid && previewIds.has(sid)) return false;
    if (s.properties?.subroute_id === "__temp_preview__") return false;
    return true;
  });

  store.hiddenSubrouteIds.clear();
  store.temp.editingSessions = [];
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  store.temp.subrouteIdEditing = null;
  syncCountersFromLoadedFeatures();
  refreshSources();
  return { ok: true };
}

function getRouteStatus(routeId) {
  const route = store.subroutesFC.features.find((f) => f.properties?.route_id === routeId);
  return normalizeStatus(route?.properties?.status);
}

function setRouteStatus(routeId, status) {
  const next = normalizeStatus(status);
  const routes = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId);
  if (!routes.length) return;
  for (const f of routes) {
    f.properties.status = next;
  }
  refreshSources();
}

function addTempNodeAt(coord, subrouteId, insertIndex = null) {
  const session = subrouteId ? store.temp.editingSessions.find((s) => s.subrouteId === subrouteId) : store.temp.editingSessions[0];
  if (!session) return;
  if (insertIndex === null) session.nodes.push(coord);
  else session.nodes.splice(insertIndex, 0, coord);
  refreshSources();
}

function deleteTempNodeByIndex(idx, subrouteId) {
  const session = subrouteId ? store.temp.editingSessions.find((s) => s.subrouteId === subrouteId) : store.temp.editingSessions[0];
  if (!session || idx < 0 || idx >= session.nodes.length) return;
  session.nodes.splice(idx, 1);
  refreshSources();
}

function updateTempNodeCoord(idx, coord, subrouteId) {
  const session = subrouteId ? store.temp.editingSessions.find((s) => s.subrouteId === subrouteId) : store.temp.editingSessions[0];
  if (!session || idx < 0 || idx >= session.nodes.length) return false;
  session.nodes[idx] = coord;
  return true;
}

function moveTempNode(idx, coord, subrouteId, options = {}) {
  if (!updateTempNodeCoord(idx, coord, subrouteId)) return;
  if (options.preview) refreshTempEditSources();
  else refreshSources();
}

function insertTempNodeOnSegment(pointPx, subrouteId) {
  const map = getMap();
  const session = subrouteId ? store.temp.editingSessions.find((s) => s.subrouteId === subrouteId) : store.temp.editingSessions[0];
  if (!map || !session || session.nodes.length < 2) return;
  const lngLat = map.unproject(pointPx);
  const line = T.lineString(session.nodes);
  const snapped = T.nearestPointOnLine(line, [lngLat.lng, lngLat.lat], { units: "meters" });
  const insertIdx = snapped.properties.index + 1;
  addTempNodeAt(snapped.geometry.coordinates, session.subrouteId, insertIdx);
}

function addStationAt(subroute_id, coord, name = null, color = null, extraProps = {}, options = {}) {
  const station_id = nextStationId();
  const defaultStation = allocateDefaultStationLabel(store.stationsFC.features, isUserStationFeature);
  const stationName = name || defaultStation.name;
  const props = { station_id, subroute_id, name: stationName, color: color, ...extraProps };
  if (!name) props.user_default_label = defaultStation.user_default_label;
  store.stationsFC.features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: coord },
    properties: props,
  });
  if (!options.skipRefresh) refreshSources();
  return station_id;
}

function expandMergedSubrouteIdsFromStation(station, mergedSubrouteIds) {
  if (typeof station?.properties?.subroute_id === "string") mergedSubrouteIds.add(station.properties.subroute_id);
  const transferRoutes = station?.properties?.transfer_routes;
  if (Array.isArray(transferRoutes)) {
    transferRoutes.forEach((rid) => {
      if (typeof rid === "string") mergedSubrouteIds.add(rid);
    });
  }
}

/** 轉乘點應吸收的一般站（含重疊的 s5/s6、路線頭尾站）。 */
function collectStationIdsToAbsorbForTransfer(coord, mergedSubrouteIds) {
  const toRemove = new Set();
  const subrouteIds = new Set(mergedSubrouteIds);
  const transferPoint = T.point(coord);

  const markForAbsorb = (s) => {
    if (!s?.properties?.station_id) return;
    if (s.properties.is_transfer_fixed) return;
    toRemove.add(s.properties.station_id);
    expandMergedSubrouteIdsFromStation(s, subrouteIds);
  };

  const seedStations = [];
  for (const s of store.stationsFC.features) {
    if (s.properties?.is_transfer_fixed) continue;
    const d = T.distance(T.point(s.geometry.coordinates), transferPoint, { units: "meters" });
    if (d <= TRANSFER_ABSORB_METERS) {
      markForAbsorb(s);
      seedStations.push(s);
    }
  }

  // Expand to every regular station coincident with any station at this overlap point.
  const queue = [...seedStations];
  const visited = new Set(seedStations.map((s) => s.properties.station_id));
  while (queue.length > 0) {
    const current = queue.shift();
    const currentPoint = T.point(current.geometry.coordinates);
    for (const s of store.stationsFC.features) {
      if (s.properties?.is_transfer_fixed) continue;
      const sid = s.properties.station_id;
      if (!sid || visited.has(sid)) continue;
      const d = T.distance(T.point(s.geometry.coordinates), currentPoint, { units: "meters" });
      if (d <= STATION_COINCIDENT_METERS) {
        visited.add(sid);
        markForAbsorb(s);
        queue.push(s);
      }
    }
  }

  for (const subrouteId of subrouteIds) {
    const route = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteId);
    if (!route?.geometry?.coordinates || route.geometry.coordinates.length < 2) continue;
    const coords = route.geometry.coordinates;
    const line = T.lineString(coords);
    const ends = [coords[0], coords[coords.length - 1]];

    for (const endCoord of ends) {
      const endNearTransfer =
        T.distance(T.point(endCoord), transferPoint, { units: "meters" }) <= TRANSFER_ABSORB_METERS;
      if (!endNearTransfer) continue;

      for (const s of store.stationsFC.features) {
        if (s.properties?.subroute_id !== subrouteId) continue;
        const sc = s.geometry.coordinates;
        const dEnd = T.distance(T.point(sc), T.point(endCoord), { units: "meters" });
        const dTr = T.distance(T.point(sc), transferPoint, { units: "meters" });
        if (dEnd <= TRANSFER_ABSORB_METERS || dTr <= TRANSFER_ABSORB_METERS) markForAbsorb(s);
      }
    }

    for (const s of store.stationsFC.features) {
      if (s.properties?.subroute_id !== subrouteId) continue;
      if (s.properties?.is_transfer_fixed) continue;
      const snapped = T.nearestPointOnLine(line, s.geometry.coordinates, { units: "meters" });
      const dAlong = snapped.properties.dist ?? Infinity;
      const dToTransfer = T.distance(T.point(s.geometry.coordinates), transferPoint, { units: "meters" });
      if (dAlong <= TRANSFER_ABSORB_METERS && dToTransfer <= TRANSFER_ABSORB_METERS) markForAbsorb(s);
    }
  }

  return { stationIds: toRemove, subrouteIds };
}

function hasTransferCoveringRoutePoint(subrouteId, pt, radiusMeters = TRANSFER_ABSORB_METERS) {
  const p = T.point(pt);
  return store.stationsFC.features.some((s) => {
    if (!s.properties?.is_transfer_fixed) return false;
    const routes = s.properties.transfer_routes || [];
    const coversRoute =
      s.properties.subroute_id === subrouteId || (Array.isArray(routes) && routes.includes(subrouteId));
    if (!coversRoute) return false;
    return T.distance(T.point(s.geometry.coordinates), p, { units: "meters" }) <= radiusMeters;
  });
}

function applyTransferAbsorption(coord, mergedSubrouteIds) {
  const { stationIds, subrouteIds } = collectStationIdsToAbsorbForTransfer(coord, mergedSubrouteIds);
  store.stationsFC.features = store.stationsFC.features.filter(
    (s) => !stationIds.has(s.properties.station_id),
  );
  return subrouteIds;
}

function normalizeAllTransferStations() {
  const transfers = store.stationsFC.features.filter((s) => s.properties?.is_transfer_fixed);
  for (const tr of transfers) {
    const coord = tr.geometry.coordinates;
    const routes = new Set(
      Array.isArray(tr.properties.transfer_routes) ? tr.properties.transfer_routes.filter(Boolean) : [],
    );
    if (typeof tr.properties.subroute_id === "string") routes.add(tr.properties.subroute_id);
    const subrouteIds = applyTransferAbsorption(coord, routes);
    tr.properties.transfer_routes = Array.from(subrouteIds);
    tr.properties.is_transfer_fixed = true;
  }
}

function addTransferStationAt(coord, subrouteIdA, subrouteIdB) {
  const mergedSubrouteIds = new Set([subrouteIdA, subrouteIdB]);
  const nearbyStations = store.stationsFC.features.filter((s) => {
    return T.distance(T.point(s.geometry.coordinates), T.point(coord), { units: "meters" }) <= TRANSFER_ABSORB_METERS;
  });
  nearbyStations.forEach((s) => expandMergedSubrouteIdsFromStation(s, mergedSubrouteIds));

  const existingTransfer = nearbyStations.find((s) => s.properties?.is_transfer_fixed);
  const finalSubrouteIds = applyTransferAbsorption(coord, mergedSubrouteIds);

  const routeFeature = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteIdA);
  const color = routeFeature?.properties?.color || "#5e35b1";
  if (existingTransfer) {
    existingTransfer.geometry.coordinates = coord;
    existingTransfer.properties.subroute_id = subrouteIdA;
    existingTransfer.properties.color = color;
    existingTransfer.properties.is_transfer_fixed = true;
    existingTransfer.properties.transfer_routes = Array.from(finalSubrouteIds);
    normalizeAllTransferStations();
    refreshSources();
    return existingTransfer.properties.station_id;
  }

  const stationId = addStationAt(subrouteIdA, coord, null, color, {
    is_transfer_fixed: true,
    transfer_routes: Array.from(finalSubrouteIds),
  });
  normalizeAllTransferStations();
  refreshSources();
  return stationId;
}

function removeStation(station_id) {
  const st = store.stationsFC.features.find((f) => f.properties.station_id === station_id);
  if (!st) return false;
  const rid = st.properties.subroute_id;
  const count = store.stationsFC.features.filter((f) => f.properties.subroute_id === rid).length;
  if (count <= store.settings.stationMinPerRoute) {
    alert(t("routeModel.alertMinStations", { min: store.settings.stationMinPerRoute }));
    return false;
  }
  store.stationsFC.features = store.stationsFC.features.filter((f) => f.properties.station_id !== station_id);
  syncCountersFromLoadedFeatures();
  refreshSources();
  return true;
}

function moveStationAlongRoute(station_id, newCoord) {
  const st = store.stationsFC.features.find((f) => f.properties.station_id === station_id);
  if (!st) return;
  const rid = st.properties.subroute_id;
  const route = store.subroutesFC.features.find((f) => f.properties.subroute_id === rid);
  if (!route) return;
  const snapped = nearestPointOnSmoothedRoute(route.geometry.coordinates, newCoord);
  if (!snapped?.geometry?.coordinates) return;
  st.geometry.coordinates = snapped.geometry.coordinates;
  refreshSources();
}

function setStationLabelPosition(station_id, labelCoord) {
  const st = store.stationsFC.features.find((f) => f.properties.station_id === station_id);
  if (!st) return;
  const map = getMap();
  const stationsData = map?.getSource("stations")?._data;
  const stationDisplayFeature = stationsData?.features?.find((f) => f.properties?.station_id === station_id);
  const centerCoord = stationDisplayFeature?.geometry?.coordinates || st.geometry.coordinates;

  if (!map) return;
  const cp = map.project(centerCoord);
  const tp = map.project(labelCoord);

  st.properties.label_offset_xy = [(tp.x - cp.x) / 12, (tp.y - cp.y) / 12];
  delete st.properties.label_lnglat;
  delete st.properties.label_is_manual;
  refreshSources();
}

function ensureEndpointStations(subroute_id, coords) {
  const ends = [coords[0], coords[coords.length - 1]];
  ends.forEach((pt) => {
    if (hasTransferCoveringRoutePoint(subroute_id, pt)) return;
    const exists = store.stationsFC.features.some((f) => {
      if (f.properties?.is_transfer_fixed) return false;
      return T.distance(T.point(f.geometry.coordinates), T.point(pt), { units: "meters" }) <= 5;
    });
    if (!exists) addStationAt(subroute_id, pt, null, null, {}, { skipRefresh: true });
  });
}

function queueStationFromExisting(coord) {
  if (!store.temp.editingSessions || store.temp.editingSessions.length === 0) return;

  let closestSession = null;
  let minDistance = Infinity;

  store.temp.editingSessions.forEach((session) => {
    if (session.nodes.length < 2) return;
    const line = T.lineString(session.nodes);
    const snapped = T.nearestPointOnLine(line, coord);
    if (snapped.properties.dist < minDistance) {
      minDistance = snapped.properties.dist;
      closestSession = session;
    }
  });

  if (!closestSession) {
    closestSession = store.temp.editingSessions[0];
  }

  const session = closestSession;
  const nodes = session.nodes;

  const nearestExisting = store.stationsFC.features.find((s) => {
    return T.distance(T.point(s.geometry.coordinates), T.point(coord), { units: "meters" }) <= 1;
  });

  if (nodes.length > 0) {
    const startPoint = T.point(nodes[0]);
    const endPoint = T.point(nodes[nodes.length - 1]);
    const clickedPoint = T.point(coord);

    const distToStart = T.distance(clickedPoint, startPoint, { units: "meters" });
    const distToEnd = T.distance(clickedPoint, endPoint, { units: "meters" });

    if (distToStart < distToEnd) {
      addTempNodeAt(coord, session.subrouteId, 0);
    } else {
      addTempNodeAt(coord, session.subrouteId);
    }
  } else {
    addTempNodeAt(coord, session.subrouteId);
  }

  // If user is routing through an existing fixed transfer station, do NOT create a new station.
  // Instead, link the transfer station to this route at commit time.
  if (nearestExisting?.properties?.is_transfer_fixed) {
    const exists = (store.temp.queuedStations || []).some(
      (q) => q?.kind === "transfer-link" && q.station_id === nearestExisting.properties.station_id && q.session === session
    );
    if (!exists) {
      store.temp.queuedStations.push({
        kind: "transfer-link",
        station_id: nearestExisting.properties.station_id,
        session,
      });
    }
    return;
  }

  const hasSamePreview = (store.temp.previewStations || []).some((sid) => {
    const st = store.stationsFC.features.find((f) => f.properties.station_id === sid);
    return st && T.distance(T.point(st.geometry.coordinates), T.point(coord), { units: "meters" }) <= 1;
  });
  if (hasSamePreview) return;

  const sid = addStationAt("__temp_preview__", coord);
  store.temp.previewStations.push(sid);
}

function mergeRoutes(subrouteIdA, subrouteIdB) {
  if (subrouteIdA === subrouteIdB) return { ok: false, msg: t("routeModel.mergeDifferent") };
  const routeA_feature = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteIdA);
  const routeB_feature = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteIdB);
  if (!routeA_feature || !routeB_feature) return { ok: false, msg: t("routeModel.mergeNotFound") };

  const lineA = T.lineString(routeA_feature.geometry.coordinates);
  const lineB = T.lineString(routeB_feature.geometry.coordinates);
  const coordsA = routeA_feature.geometry.coordinates;
  const coordsB = routeB_feature.geometry.coordinates;
  const checks = [
    { sourcePoint: T.point(coordsA[0]), targetLine: lineB, sourceSubrouteId: subrouteIdA, targetSubrouteId: subrouteIdB },
    { sourcePoint: T.point(coordsA[coordsA.length - 1]), targetLine: lineB, sourceSubrouteId: subrouteIdA, targetSubrouteId: subrouteIdB },
    { sourcePoint: T.point(coordsB[0]), targetLine: lineA, sourceSubrouteId: subrouteIdB, targetSubrouteId: subrouteIdA },
    { sourcePoint: T.point(coordsB[coordsB.length - 1]), targetLine: lineA, sourceSubrouteId: subrouteIdB, targetSubrouteId: subrouteIdA },
  ];
  let bestConnection = { dist: Infinity };
  for (const check of checks) {
    const snapped = T.nearestPointOnLine(check.targetLine, check.sourcePoint, { units: "meters" });
    if (snapped.properties.dist < bestConnection.dist) {
      bestConnection = {
        dist: snapped.properties.dist,
        snappedPoint: snapped.geometry.coordinates,
        sourceSubrouteId: check.sourceSubrouteId,
        targetSubrouteId: check.targetSubrouteId,
      };
    }
  }
  if (bestConnection.dist <= 5) {
    let stationToRemoveId = null;
    let minStationDist = Infinity;
    store.stationsFC.features.forEach((station) => {
      if (station.properties.subroute_id === bestConnection.targetSubrouteId) {
        const dist = T.distance(T.point(station.geometry.coordinates), T.point(bestConnection.snappedPoint), { units: "meters" });
        if (dist < minStationDist) {
          minStationDist = dist;
          stationToRemoveId = station.properties.station_id;
        }
      }
    });
    if (stationToRemoveId && minStationDist < 1) {
      store.stationsFC.features = store.stationsFC.features.filter((f) => f.properties.station_id !== stationToRemoveId);
    }
  }
  const targetRouteId = routeA_feature.properties.route_id;
  const sourceRouteId = routeB_feature.properties.route_id;

  // Merge whole lines (not a single sub-route pick), so selection order does not split lines.
  if (sourceRouteId !== targetRouteId) {
    store.subroutesFC.features.forEach((route) => {
      if (route.properties.route_id === sourceRouteId) {
        route.properties.route_id = targetRouteId;
      }
    });
  }

  syncRouteSubrouteMetadata(targetRouteId, routeA_feature.properties);

  const unifiedColor = routeA_feature.properties.color || routeB_feature.properties.color || "#1e88e5";
  setRouteColor(targetRouteId, unifiedColor);
  syncCountersFromLoadedFeatures();
  return { ok: true };
}

function splitLine(subrouteId) {
  const target = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteId);
  if (!target) return { ok: false, msg: t("routeModel.splitLineNotFound") };

  const routeId = target.properties.route_id;
  const subroutesInRoute = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId);
  if (subroutesInRoute.length <= 1) {
    return { ok: false, msg: t("routeModel.splitLineSingle") };
  }

  subroutesInRoute.forEach((route) => {
    route.properties.route_id = nextRouteId();
  });
  normalizeUserDefaultNames();
  bumpRoutesGeometryRevision();
  refreshSources();
  return { ok: true };
}

function setSubrouteColor(subrouteId, color) {
  const routeFeature = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteId);
  if (routeFeature) {
    routeFeature.properties.color = color;
    store.stationsFC.features.forEach((station) => {
      if (station.properties.subroute_id === subrouteId) {
        station.properties.color = color;
      }
    });
    refreshSources();
  }
}

function setRouteColor(routeId, color) {
  const subroutesInRoute = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId);
  if (!subroutesInRoute.length) return;
  const subrouteIdsInRoute = subroutesInRoute.map((f) => f.properties.subroute_id);
  subroutesInRoute.forEach((route) => {
    route.properties.color = color;
  });
  store.stationsFC.features.forEach((station) => {
    if (subrouteIdsInRoute.includes(station.properties.subroute_id)) {
      station.properties.color = color;
    }
  });
  refreshSources();
}

function setRouteName(routeId, newName) {
  const next = clampName15(newName);
  store.subroutesFC.features.forEach((f) => {
    if (f.properties.route_id === routeId) {
      f.properties.name = next;
      if (shouldClearRouteLabelOnRename(next, f.properties.subroute_id, f.properties.user_default_route_label)) {
        delete f.properties.user_default_route_label;
      }
    }
  });
  refreshSources();
}

function setStationName(stationId, newName) {
  const station = store.stationsFC.features.find((f) => f.properties.station_id === stationId);
  if (station) {
    const next = clampName15(newName);
    station.properties.name = next;
    if (shouldClearStationLabelOnRename(next, station.properties.station_id)) {
      delete station.properties.user_default_label;
    }
  }
  refreshSources();
}

function setRouteMetadata(routeId, patch) {
  if (!patch || typeof patch !== "object") return;
  const routes = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId);
  if (!routes.length) return;
  for (const f of routes) {
    if (patch.route_kind === ROUTE_KIND_DEFAULT || patch.route_kind === ROUTE_KIND_USER) {
      f.properties.route_kind = patch.route_kind;
    }
    if (typeof patch.country === "string") f.properties.country = patch.country;
    if (typeof patch.region === "string") f.properties.region = patch.region;
    if (patch.status && ROUTE_STATUS_VALUES.has(patch.status)) f.properties.status = patch.status;
  }
  refreshSources();
}

function sanitizeRouteForExport(feature) {
  const c = JSON.parse(JSON.stringify(feature));
  if (!c.properties || typeof c.properties !== "object") c.properties = {};
  normalizeRouteProperties(c.properties);
  c.properties.route_kind = ROUTE_KIND_USER;
  return c;
}

function sanitizeStationForExport(feature) {
  if (feature?.properties?.subroute_id === "__temp_preview__") return null;
  const c = JSON.parse(JSON.stringify(feature));
  if (!c.properties || typeof c.properties !== "object") c.properties = {};
  for (const key of DISPLAY_ONLY_STATION_PROPS) {
    delete c.properties[key];
  }
  delete c.properties.label_lnglat;
  delete c.properties.label_is_manual;
  return c;
}

function buildUserExportPayload(routeIds) {
  const routeIdSet = Array.isArray(routeIds) && routeIds.length > 0 ? new Set(routeIds) : null;
  let userRouteFeatures = store.subroutesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
  if (routeIdSet) {
    userRouteFeatures = userRouteFeatures.filter((f) => routeIdSet.has(f.properties.route_id));
  }
  const userSubroutes = userRouteFeatures.map(sanitizeRouteForExport);
  const userSubrouteIds = new Set(userSubroutes.map((f) => f.properties.subroute_id));
  const userStations = extractUserStationsByRoutes(store.stationsFC.features, userSubrouteIds)
    .map(sanitizeStationForExport)
    .filter(Boolean);
  const hiddenSubrouteIds = Array.from(store.hiddenSubrouteIds).filter((id) => userSubrouteIds.has(id));
  const mapView = computeMapViewFromFeatures(userSubroutes, userStations);
  return {
    format: EXPORT_FILE_FORMAT,
    formatVersion: PERSIST_VERSION,
    exportedAt: new Date().toISOString(),
    v: PERSIST_VERSION,
    userSubroutesFC: { type: "FeatureCollection", features: userSubroutes },
    userStationsFC: { type: "FeatureCollection", features: userStations },
    hiddenSubrouteIds,
    counters: { ...store.counters },
    settings: { ...store.settings },
    ...(mapView ? { mapView } : {}),
  };
}

function hasUserContent() {
  return store.subroutesFC.features.some((f) => routeKindOf(f) === ROUTE_KIND_USER);
}

function clearUserContent() {
  const userSubrouteIds = new Set(
    store.subroutesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER).map((f) => f.properties.subroute_id)
  );
  store.subroutesFC.features = store.subroutesFC.features.filter((f) => routeKindOf(f) !== ROUTE_KIND_USER);
  store.stationsFC.features = store.stationsFC.features.filter((s) => {
    const rid = s?.properties?.subroute_id;
    if (rid === "__temp_preview__") return false;
    if (userSubrouteIds.has(rid)) return false;
    const transferRoutes = s?.properties?.transfer_routes;
    return !(Array.isArray(transferRoutes) && transferRoutes.some((tr) => userSubrouteIds.has(tr)));
  });
  userSubrouteIds.forEach((rid) => store.hiddenSubrouteIds.delete(rid));
  store.temp.editingSessions = [];
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  store.temp.subrouteIdEditing = null;
  syncCountersFromLoadedFeatures();
}

function getExistingUserRouteIdSet() {
  const ids = new Set();
  for (const f of store.subroutesFC.features) {
    if (routeKindOf(f) !== ROUTE_KIND_USER) continue;
    const routeId = f.properties?.route_id;
    if (typeof routeId === "string") ids.add(routeId);
  }
  return ids;
}

function normalizeRouteNameForDuplicate(name) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
}

function getExistingUserRouteNameSet() {
  const names = new Set();
  const seenRouteIds = new Set();
  for (const f of store.subroutesFC.features) {
    if (routeKindOf(f) !== ROUTE_KIND_USER) continue;
    const routeId = f.properties?.route_id;
    if (typeof routeId !== "string" || seenRouteIds.has(routeId)) continue;
    seenRouteIds.add(routeId);
    const name = normalizeRouteNameForDuplicate(f.properties?.name);
    if (name) names.add(name);
  }
  return names;
}

/** Import `route_id` values whose normalized route name, or fallback id, already exists. */
function getImportDuplicateRouteIds(userSubroutes) {
  const existingNames = getExistingUserRouteNameSet();
  const existingIds = getExistingUserRouteIdSet();
  const duplicates = [];
  const seen = new Set();
  for (const f of userSubroutes) {
    const routeId = f.properties?.route_id;
    if (typeof routeId !== "string" || seen.has(routeId)) continue;
    const name = normalizeRouteNameForDuplicate(f.properties?.name);
    const isDuplicate = name ? existingNames.has(name) : existingIds.has(routeId);
    if (!isDuplicate) continue;
    seen.add(routeId);
    duplicates.push(routeId);
  }
  return duplicates.sort((a, b) => a.localeCompare(b, "en"));
}

function deleteUserRoutesByImportMatches(userSubroutes, routeIds) {
  if (!Array.isArray(routeIds) || !routeIds.length) return;
  const idSet = new Set(routeIds);
  const duplicateNames = new Set();
  for (const f of userSubroutes) {
    if (!idSet.has(f.properties?.route_id)) continue;
    const name = normalizeRouteNameForDuplicate(f.properties?.name);
    if (name) duplicateNames.add(name);
  }

  const toDelete = [];
  const seen = new Set();
  for (const f of store.subroutesFC.features) {
    if (routeKindOf(f) !== ROUTE_KIND_USER) continue;
    const routeId = f.properties?.route_id;
    if (typeof routeId !== "string" || seen.has(routeId)) continue;
    const name = normalizeRouteNameForDuplicate(f.properties?.name);
    if ((name && duplicateNames.has(name)) || idSet.has(routeId)) {
      seen.add(routeId);
      toDelete.push(routeId);
    }
  }
  if (toDelete.length) deleteRoutes(toDelete);
}

function countSubroutesInRoutesByIds(userSubroutes, routeIds) {
  const idSet = new Set(routeIds);
  return userSubroutes.filter((f) => idSet.has(f.properties?.route_id)).length;
}

function buildImportResultStats(userSubroutes, userStations, mode, duplicateRouteIds) {
  const importRouteIds = new Set();
  for (const f of userSubroutes) {
    const routeId = f.properties?.route_id;
    if (typeof routeId === "string") importRouteIds.add(routeId);
  }
  const duplicateSet = new Set(duplicateRouteIds);
  const addedRouteIds = [...importRouteIds].filter((id) => !duplicateSet.has(id));
  const replacedSubRouteCount = countSubroutesInRoutesByIds(userSubroutes, duplicateRouteIds);
  const addedSubRouteCount = countSubroutesInRoutesByIds(userSubroutes, addedRouteIds);

  return {
    mode,
    subRouteCount: userSubroutes.length,
    stationCount: userStations.length,
    routeCount: importRouteIds.size,
    replacedRouteCount: duplicateRouteIds.length,
    addedRouteCount: addedRouteIds.length,
    replacedSubRouteCount,
    addedSubRouteCount,
  };
}

function parseImportPayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("invalid_json");
  }
  if (data.format && data.format !== EXPORT_FILE_FORMAT) {
    throw new Error("unsupported_format");
  }
  const allSubroutes = Array.isArray(data.userSubroutesFC?.features)
    ? data.userSubroutesFC.features
    : Array.isArray(data.subroutesFC?.features)
      ? data.subroutesFC.features
      : null;
  const allStations = Array.isArray(data.userStationsFC?.features)
    ? data.userStationsFC.features
    : Array.isArray(data.stationsFC?.features)
      ? data.stationsFC.features
      : null;
  if (!allSubroutes || !allStations) {
    throw new Error("missing_features");
  }
  const userSubroutes = extractUserOnlyRoutes(allSubroutes);
  const userSubrouteIds = new Set(userSubroutes.map((f) => f?.properties?.subroute_id).filter((id) => typeof id === "string"));
  const userStations = extractUserStationsByRoutes(allStations, userSubrouteIds)
    .map(sanitizeStationForExport)
    .filter(Boolean);
  const mapView =
    normalizeImportedMapView(data.mapView) ??
    normalizeImportedMapView(data.mapCenter) ??
    computeMapViewFromFeatures(userSubroutes, userStations);

  return {
    userSubroutes,
    userStations,
    hiddenSubrouteIds: Array.isArray(data.hiddenSubrouteIds) ? data.hiddenSubrouteIds : [],
    counters: data.counters,
    settings: data.settings,
    mapView,
  };
}

function exportUserStateJSON() {
  return JSON.stringify(buildUserExportPayload(), null, 2);
}

function exportStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getExportFileName() {
  return `metro-map-${exportStamp()}.json`;
}

function getExportFileNameForSelectedRoutes(routeCount) {
  return `metro-map-selected-${routeCount}-${exportStamp()}.json`;
}

/**
 * @param {string[]} routeIds
 * @returns {{ ok: true, json: string, fileName: string } | { ok: false, error: string }}
 */
function exportRoutesJSON(routeIds) {
  if (!Array.isArray(routeIds) || routeIds.length === 0) {
    return { ok: false, error: "no_lines" };
  }
  const payload = buildUserExportPayload(routeIds);
  if (!payload.userSubroutesFC.features.length) {
    return { ok: false, error: "no_user_routes" };
  }
  return {
    ok: true,
    json: JSON.stringify(payload, null, 2),
    fileName: getExportFileNameForSelectedRoutes(routeIds.length),
  };
}

/**
 * @param {string} jsonString
 * @returns {{ ok: true, duplicateRouteIds: string[] } | { ok: false, error: string }}
 */
function analyzeImportJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    const { userSubroutes } = parseImportPayload(data);
    return { ok: true, duplicateRouteIds: getImportDuplicateRouteIds(userSubroutes) };
  } catch (e) {
    const code = e instanceof Error && e.message ? e.message : "import_failed";
    return { ok: false, error: code };
  }
}

/** @typedef {'replaceAll' | 'merge' | 'replaceMatching'} ImportMode */

/**
 * @param {string} jsonString
 * @param {{ mode?: ImportMode }} [options]
 * @returns {({ ok: true } & ReturnType<typeof buildImportResultStats>) | { ok: false, error: string }}
 */
function importUserStateJSON(jsonString, options = {}) {
  skipImportUndoInvalidate = true;
  const snapshotBeforeImport = captureUserStateSnapshot();
  try {
    const data = JSON.parse(jsonString);
    const { userSubroutes, userStations, hiddenSubrouteIds, settings, mapView } = parseImportPayload(data);
    const mode = options.mode ?? "merge";
    const duplicateRouteIds =
      mode === "replaceMatching" ? getImportDuplicateRouteIds(userSubroutes) : [];
    if (mode === "replaceAll") {
      clearUserContent();
    } else if (mode === "replaceMatching") {
      deleteUserRoutesByImportMatches(userSubroutes, duplicateRouteIds);
    }
    mergeUserStateIntoStore(userSubroutes, userStations);
    if (Array.isArray(hiddenSubrouteIds)) {
      for (const rid of hiddenSubrouteIds) {
        if (typeof rid === "string") store.hiddenSubrouteIds.add(rid);
      }
    }
    if (settings && typeof settings.stationMinPerRoute === "number") {
      store.settings.stationMinPerRoute = settings.stationMinPerRoute;
    }
    syncCountersFromLoadedFeatures();
    normalizeAllSubroutesMetadata();
    normalizeUserDefaultNames();
    lastImportUndoSnapshot = snapshotBeforeImport;
    refreshSources();
    notifyImportUndoListeners();
    scheduleImportMapView(mapView);
    return { ok: true, mapView, ...buildImportResultStats(userSubroutes, userStations, mode, duplicateRouteIds) };
  } catch (e) {
    restoreUserStateSnapshot(snapshotBeforeImport);
    lastImportUndoSnapshot = null;
    refreshSources();
    notifyImportUndoListeners();
    const code = e instanceof Error && e.message ? e.message : "import_failed";
    return { ok: false, error: code };
  } finally {
    skipImportUndoInvalidate = false;
  }
}

export const Route = {
  ROUTE_KIND_DEFAULT,
  ROUTE_KIND_USER,
  ROUTE_STATUS_OPERATING,
  ROUTE_STATUS_PLANNING,
  ROUTE_STATUS_CONSTRUCTION,
  ROUTE_STATUS_CUSTOM,
  getRouteList,
  getRouteStatus,
  setRouteStatus,
  getActiveEditRouteId,
  setRouteMetadata,
  deleteSubroute,
  deleteRoute,
  deleteRoutes,
  setRouteHidden,
  isRouteHidden,
  highlightRoute,
  clearHover,
  startNewTempRoute,
  startEditRoute,
  endTempEditingAndCommit,
  cancelTempEditing,
  addTempNodeAt,
  deleteTempNodeByIndex,
  moveTempNode,
  updateTempNodeCoord,
  insertTempNodeOnSegment,
  queueStationFromExisting,
  addStationAt,
  addTransferStationAt,
  removeStation,
  moveStationAlongRoute,
  mergeRoutes,
  splitLine,
  setSubrouteColor,
  setRouteColor,
  setRouteName,
  setStationName,
  setStationLabelPosition,
  resolveRouteDisplayName,
  resolveRouteDisplayNameFromProps,
  resolveStationDisplayName,
  refreshSources,
  refreshTempEditSources,
  refreshTransferSnapSource,
  hasUserContent,
  analyzeImportJSON,
  exportUserStateJSON,
  exportRoutesJSON,
  getExportFileName,
  importUserStateJSON,
  canUndoLastImport,
  undoLastImport,
  subscribeImportUndoAvailability,
  _store: store,
};
