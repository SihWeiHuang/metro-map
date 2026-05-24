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
import { REGULAR_STATION_LAYER_FILTER, TRANSFER_STATION_LAYER_FILTER } from "./layers.js";
import {
  allocateDefaultLineLabel,
  allocateDefaultStationLabel,
  normalizeAllUserDefaultNames,
  resolveLineDisplayName,
  resolveLineDisplayNameFromProps,
  resolveStationDisplayName,
  shouldClearLineLabelOnRename,
  shouldClearStationLabelOnRename,
} from "./defaultNames.js";

/**
 * Terminology (user-facing):
 * - `group_id` in GeoJSON = 路線 (line)
 * - `route_id` in GeoJSON = 子路線 (sub-route)
 * JSON field names are kept for file compatibility.
 */

export const store = {
  routesFC: { type: "FeatureCollection", features: [] },
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
    routeIdEditing: null,
  },
  hiddenRouteIds: new Set(),
  counters: { route: 1, group: 1, station: 1 },
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
  const routes = new Set();
  const groups = new Set();
  const stations = new Set();
  for (const f of store.routesFC.features) {
    addNumericIdToSet(routes, f.properties?.route_id, /^r(\d+)$/);
    addNumericIdToSet(groups, f.properties?.group_id, /^g(\d+)$/);
  }
  for (const f of store.stationsFC.features) {
    addNumericIdToSet(stations, f.properties?.station_id, /^s(\d+)$/);
  }
  for (const session of store.temp.editingSessions || []) {
    addNumericIdToSet(routes, session?.routeId, /^r(\d+)$/);
  }
  for (const sid of store.temp.previewStations || []) {
    addNumericIdToSet(stations, sid, /^s(\d+)$/);
  }
  for (const q of store.temp.queuedStations || []) {
    addNumericIdToSet(stations, q?.station_id, /^s(\d+)$/);
  }
  return { routes, groups, stations };
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
  alignCounterToUsedIds("route", used.routes);
  alignCounterToUsedIds("group", used.groups);
  alignCounterToUsedIds("station", used.stations);
}

function deepCloneFC(fc) {
  if (!fc || !Array.isArray(fc.features)) return { type: "FeatureCollection", features: [] };
  return JSON.parse(JSON.stringify({ type: "FeatureCollection", features: fc.features }));
}

function normalizeBuiltinRoutesAsDefault() {
  for (const f of store.routesFC.features) {
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
  const routesFC = deepCloneFC(DEFAULT_BUILTIN_MAP_DATA?.routesFC);
  const stationsFC = deepCloneFC(DEFAULT_BUILTIN_MAP_DATA?.stationsFC);
  store.routesFC = routesFC;
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
  const rid = stationFeature?.properties?.route_id;
  if (typeof rid === "string") {
    const route = store.routesFC.features.find((f) => f.properties?.route_id === rid);
    if (route && isUserRouteFeature(route)) return true;
  }
  const transferRoutes = stationFeature?.properties?.transfer_routes;
  if (Array.isArray(transferRoutes)) {
    return transferRoutes.some((tr) => {
      const route = store.routesFC.features.find((f) => f.properties?.route_id === tr);
      return route && isUserRouteFeature(route);
    });
  }
  return false;
}

function normalizeUserDefaultNames() {
  normalizeAllUserDefaultNames(
    store.routesFC.features,
    store.stationsFC.features,
    isUserRouteFeature,
    isUserStationFeature
  );
  schedulePersistToStorage();
}

function extractUserOnlyRoutes(routes) {
  return routes.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
}

function extractUserStationsByRoutes(stations, userRouteIds) {
  return stations.filter((s) => {
    const rid = s?.properties?.route_id;
    if (userRouteIds.has(rid)) return true;
    const transferRoutes = s?.properties?.transfer_routes;
    return Array.isArray(transferRoutes) && transferRoutes.some((tr) => userRouteIds.has(tr));
  });
}

function mergeUserStateIntoStore(userRoutes, userStations) {
  const existingRouteIds = new Set(store.routesFC.features.map((f) => f.properties?.route_id));
  const existingGroupIds = new Set(store.routesFC.features.map((f) => f.properties?.group_id));
  const existingStationIds = new Set(store.stationsFC.features.map((f) => f.properties?.station_id));

  let routeCounter = store.counters.route;
  let groupCounter = store.counters.group;
  let stationCounter = store.counters.station;
  const nextRoute = () => {
    while (existingRouteIds.has(`r${routeCounter}`)) routeCounter += 1;
    const id = `r${routeCounter++}`;
    existingRouteIds.add(id);
    return id;
  };
  const nextGroup = () => {
    while (existingGroupIds.has(`g${groupCounter}`)) groupCounter += 1;
    const id = `g${groupCounter++}`;
    existingGroupIds.add(id);
    return id;
  };
  const nextStation = () => {
    while (existingStationIds.has(`s${stationCounter}`)) stationCounter += 1;
    const id = `s${stationCounter++}`;
    existingStationIds.add(id);
    return id;
  };

  const routeIdMap = new Map();
  const groupIdMap = new Map();
  const mergedRoutes = userRoutes.map((f) => {
    const c = JSON.parse(JSON.stringify(f));
    const oldRouteId = c?.properties?.route_id;
    const oldGroupId = c?.properties?.group_id;
    const newRouteId = typeof oldRouteId === "string" && !existingRouteIds.has(oldRouteId) ? oldRouteId : nextRoute();
    if (typeof oldRouteId === "string") routeIdMap.set(oldRouteId, newRouteId);
    if (typeof oldGroupId === "string") {
      if (!groupIdMap.has(oldGroupId)) {
        const mapped = !existingGroupIds.has(oldGroupId) ? oldGroupId : nextGroup();
        groupIdMap.set(oldGroupId, mapped);
        existingGroupIds.add(mapped);
      }
    }
    if (!c.properties || typeof c.properties !== "object") c.properties = {};
    c.properties.route_id = newRouteId;
    c.properties.group_id = typeof oldGroupId === "string" ? groupIdMap.get(oldGroupId) : nextGroup();
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
    if (typeof c.properties.route_id === "string" && routeIdMap.has(c.properties.route_id)) {
      c.properties.route_id = routeIdMap.get(c.properties.route_id);
    }
    if (Array.isArray(c.properties.transfer_routes)) {
      c.properties.transfer_routes = c.properties.transfer_routes.map((rid) => routeIdMap.get(rid) || rid);
    }
    return c;
  });

  store.routesFC.features.push(...mergedRoutes);
  store.stationsFC.features.push(...mergedStations);
  if (mergedRoutes.length) bumpRoutesGeometryRevision();
  syncCountersFromLoadedFeatures();
}

function loadPersistedUserState() {
  if (typeof localStorage === "undefined") return;
  try {
    const rawV2 = localStorage.getItem(PERSIST_STORAGE_KEY);
    const rawV1 = localStorage.getItem("metro-map-data-v1");
    const data = rawV2 ? JSON.parse(rawV2) : rawV1 ? JSON.parse(rawV1) : null;
    if (!data || typeof data !== "object") return;

    const allRoutes = Array.isArray(data.userRoutesFC?.features)
      ? data.userRoutesFC.features
      : Array.isArray(data.routesFC?.features)
        ? data.routesFC.features
        : [];
    const allStations = Array.isArray(data.userStationsFC?.features)
      ? data.userStationsFC.features
      : Array.isArray(data.stationsFC?.features)
        ? data.stationsFC.features
        : [];
    const userRoutes = extractUserOnlyRoutes(allRoutes);
    const userRouteIds = new Set(userRoutes.map((f) => f?.properties?.route_id).filter((id) => typeof id === "string"));
    const userStations = extractUserStationsByRoutes(allStations, userRouteIds);
    mergeUserStateIntoStore(userRoutes, userStations);

    if (Array.isArray(data.hiddenRouteIds)) {
      store.hiddenRouteIds = new Set(data.hiddenRouteIds);
    }
    if (data.settings && typeof data.settings.stationMinPerRoute === "number") {
      store.settings.stationMinPerRoute = data.settings.stationMinPerRoute;
    }
    syncCountersFromLoadedFeatures();
    normalizeAllRoutesMetadata();
    normalizeUserDefaultNames();
  } catch (_) {
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
      const userRoutes = store.routesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
      const userRouteIds = new Set(userRoutes.map((f) => f.properties?.route_id));
      const userStations = extractUserStationsByRoutes(store.stationsFC.features, userRouteIds);
      const payload = {
        v: PERSIST_VERSION,
        userRoutesFC: { type: "FeatureCollection", features: userRoutes },
        userStationsFC: { type: "FeatureCollection", features: userStations },
        hiddenRouteIds: Array.from(store.hiddenRouteIds),
        counters: { ...store.counters },
        settings: { ...store.settings },
      };
      localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("metro-map: could not save map data", e);
    }
  }, 200);
}

const nextRouteId = () => {
  syncCountersFromLoadedFeatures();
  return `r${store.counters.route++}`;
};
const nextGroupId = () => {
  syncCountersFromLoadedFeatures();
  return `g${store.counters.group++}`;
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

function normalizeAllRoutesMetadata() {
  for (const f of store.routesFC.features) {
    normalizeRouteProperties(f.properties);
  }
}

function syncLineSubRouteMetadata(groupId, sourceProps) {
  const kind =
    sourceProps?.route_kind === ROUTE_KIND_DEFAULT || sourceProps?.route_kind === ROUTE_KIND_USER
      ? sourceProps.route_kind
      : ROUTE_KIND_USER;
  const country = typeof sourceProps?.country === "string" ? sourceProps.country : "";
  const region = typeof sourceProps?.region === "string" ? sourceProps.region : "";
  const status = normalizeStatus(sourceProps?.status);
  store.routesFC.features.forEach((f) => {
    if (f.properties.group_id !== groupId) return;
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
  const ridA = snapFeature.properties.route_id_a;
  const ridB = snapFeature.properties.route_id_b;
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
  const routes = store.routesFC.features.filter((f) => f.geometry?.type === "LineString" && f.geometry.coordinates.length >= 2);
  const addSnapFeature = (coord, routeA, routeB, prefix) => {
    const isDup = seen.some((prev) => T.distance(T.point(prev), T.point(coord), { units: "meters" }) < TRANSFER_DEDUP_METERS);
    if (isDup) return;
    seen.push(coord);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coord },
      properties: {
        snap_id: `${prefix}_${routeA.properties.route_id}_${routeB.properties.route_id}_${features.length}`,
        route_id_a: routeA.properties.route_id,
        route_id_b: routeB.properties.route_id,
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
  const userRoutes = store.routesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
  const userRouteIds = new Set(userRoutes.map((f) => f.properties?.route_id).filter((id) => typeof id === "string"));
  const userStations = extractUserStationsByRoutes(store.stationsFC.features, userRouteIds);
  return {
    userRoutes: JSON.parse(JSON.stringify(userRoutes)),
    userStations: JSON.parse(JSON.stringify(userStations)),
    hiddenRouteIds: Array.from(store.hiddenRouteIds).filter((id) => userRouteIds.has(id)),
    counters: { ...store.counters },
    settings: { ...store.settings },
  };
}

function restoreUserStateSnapshot(snapshot) {
  clearUserContent();
  if (snapshot.userRoutes.length || snapshot.userStations.length) {
    mergeUserStateIntoStore(snapshot.userRoutes, snapshot.userStations);
  }
  store.hiddenRouteIds = new Set(snapshot.hiddenRouteIds);
  store.counters = { ...snapshot.counters };
  store.settings = { ...snapshot.settings };
  syncCountersFromLoadedFeatures();
  normalizeAllRoutesMetadata();
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
    const mapView = computeMapViewFromFeatures(snapshot.userRoutes, snapshot.userStations);
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
        properties: { route_id: session.routeId },
      });
    }
    session.nodes.forEach((c, i) => {
      tempNodes.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: c },
        properties: { idx: i, route_id: session.routeId },
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
  const { stationsDisplayFC, stationLabelsFC } = buildStationDisplayCollections(store.stationsFC, store.routesFC);
  map.getSource("routes") &&
    map.getSource("routes").setData(featureCollectionWithSmoothedLineStrings(store.routesFC));
  map.getSource("stations") && map.getSource("stations").setData(stationsDisplayFC);
  map.getSource("station-labels") && map.getSource("station-labels").setData(stationLabelsFC);

  const { tempLineFC, tempNodesFC } = buildTempEditFeatureCollections();
  map.getSource("temp-edit-line") && map.getSource("temp-edit-line").setData(tempLineFC);
  map.getSource("temp-edit-nodes") && map.getSource("temp-edit-nodes").setData(tempNodesFC);

  const hiddenIds = Array.from(store.hiddenRouteIds);
  const visibleRouteIds = Array.from(
    new Set(store.routesFC.features.map((f) => f.properties.route_id).filter((rid) => !store.hiddenRouteIds.has(rid)))
  );
  const transferAnyVisibleExpr = visibleRouteIds.length
    ? ["any", ...visibleRouteIds.map((rid) => ["in", rid, ["coalesce", ["get", "transfer_routes"], ["literal", []]]])]
    : false;
  const stationVisibleFilter = ["any", ["in", ["get", "route_id"], ["literal", visibleRouteIds]], transferAnyVisibleExpr];
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
    map.setFilter("routes-line", ["!", ["in", ["get", "route_id"], ["literal", hiddenIds]]]);
  }
}

function highlightRoute(routeId) {
  const map = getMap();
  if (!map) return;
  const route = store.routesFC.features.find((f) => f.properties.route_id === routeId);
  const groupId = route ? route.properties.group_id : "";
  const hiddenIds = Array.from(store.hiddenRouteIds);

  if (map.getLayer("routes-line-hover")) {
    if (!groupId) {
      map.setFilter("routes-line-hover", ["==", ["get", "route_id"], ""]);
    } else {
      map.setFilter("routes-line-hover", [
        "all",
        ["==", ["get", "group_id"], groupId],
        ["!", ["in", ["get", "route_id"], ["literal", hiddenIds]]],
      ]);
    }
  }

  const routeIdsInGroup = groupId
    ? store.routesFC.features.filter((f) => f.properties.group_id === groupId).map((f) => f.properties.route_id)
    : [];
  const visibleRouteIdsInGroup = routeIdsInGroup.filter((rid) => !store.hiddenRouteIds.has(rid));
  const transferAnyMatchExpr = visibleRouteIdsInGroup.length
    ? ["any", ...visibleRouteIdsInGroup.map((rid) => ["in", rid, ["coalesce", ["get", "transfer_routes"], ["literal", []]]])]
    : false;
  const stationHoverFilter =
    visibleRouteIdsInGroup.length === 0
      ? ["==", ["get", "station_id"], ""]
      : ["any", ["in", ["get", "route_id"], ["literal", visibleRouteIdsInGroup]], transferAnyMatchExpr];

  map.getLayer("stations-circle-hover") &&
    map.setFilter("stations-circle-hover", ["all", REGULAR_STATION_LAYER_FILTER, stationHoverFilter]);

  map.getLayer("transfer-stations-circle-hover") &&
    map.setFilter("transfer-stations-circle-hover", ["all", TRANSFER_STATION_LAYER_FILTER, stationHoverFilter]);

  // Route-hover should highlight station labels too.
  // (Do NOT set this in refreshSources; it must remain hover-driven.)
  map.getLayer("stations-label-hover") &&
    map.setFilter("stations-label-hover", stationHoverFilter);
}

function clearHover() {
  const map = getMap();
  if (!map) return;
  map.getLayer("routes-line-hover") && map.setFilter("routes-line-hover", ["==", ["get", "route_id"], ""]);
  map.getLayer("stations-circle-hover") && map.setFilter("stations-circle-hover", ["==", ["get", "station_id"], ""]);
  map.getLayer("transfer-stations-circle-hover") &&
    map.setFilter("transfer-stations-circle-hover", ["==", ["get", "station_id"], ""]);
  map.getLayer("stations-label-hover") && map.setFilter("stations-label-hover", ["==", ["get", "station_id"], ""]);
}

function getLineList() {
  const groups = {};
  store.routesFC.features.forEach((f) => {
    const p = f.properties;
    const rk =
      p.route_kind === ROUTE_KIND_DEFAULT || p.route_kind === ROUTE_KIND_USER ? p.route_kind : ROUTE_KIND_USER;
    const country = typeof p.country === "string" ? p.country : "";
    const region = typeof p.region === "string" ? p.region : "";
    const status = normalizeStatus(p.status);
    if (!groups[p.group_id]) groups[p.group_id] = [];
    groups[p.group_id].push({
      route_id: p.route_id,
      name: resolveLineDisplayName(p.name, p.route_id, p.user_default_line_label),
      color: p.color || "#1e88e5",
      route_kind: rk,
      country,
      region,
      status,
    });
  });
  return Object.entries(groups).map(([line_id, sub_routes]) => {
    const head = sub_routes[0];
    return {
      line_id,
      sub_routes,
      route_kind: head?.route_kind ?? ROUTE_KIND_USER,
      country: head?.country ?? "",
      region: head?.region ?? "",
      status: head?.status ?? ROUTE_STATUS_CUSTOM,
    };
  });
}

function getActiveEditLineId() {
  if (!Array.isArray(store.temp.editingSessions) || store.temp.editingSessions.length === 0) return null;
  for (const session of store.temp.editingSessions) {
    if (!session?.routeId) continue;
    const route = store.routesFC.features.find((f) => f.properties?.route_id === session.routeId);
    if (route?.properties?.group_id) return route.properties.group_id;
  }
  return null;
}

function deleteRoute(route_id) {
  store.routesFC.features = store.routesFC.features.filter((f) => f.properties.route_id !== route_id);
  store.stationsFC.features = store.stationsFC.features.filter((f) => f.properties.route_id !== route_id);
  store.hiddenRouteIds.delete(route_id);
  syncCountersFromLoadedFeatures();
  bumpRoutesGeometryRevision();
  refreshSources();
}

function deleteLine(groupId) {
  const routeIdsInGroup = store.routesFC.features.filter((f) => f.properties.group_id === groupId).map((f) => f.properties.route_id);

  if (routeIdsInGroup.length === 0) return;

  store.routesFC.features = store.routesFC.features.filter((f) => f.properties.group_id !== groupId);
  store.stationsFC.features = store.stationsFC.features.filter((f) => !routeIdsInGroup.includes(f.properties.route_id));
  routeIdsInGroup.forEach((rid) => store.hiddenRouteIds.delete(rid));
  syncCountersFromLoadedFeatures();
  bumpRoutesGeometryRevision();
  refreshSources();
}

function deleteLines(groupIds) {
  if (!Array.isArray(groupIds) || groupIds.length === 0) return;
  const idSet = new Set(groupIds);
  const routeIdsToDelete = store.routesFC.features
    .filter((f) => idSet.has(f.properties.group_id))
    .map((f) => f.properties.route_id);
  if (!routeIdsToDelete.length) return;

  store.routesFC.features = store.routesFC.features.filter((f) => !idSet.has(f.properties.group_id));
  store.stationsFC.features = store.stationsFC.features.filter((f) => !routeIdsToDelete.includes(f.properties.route_id));
  routeIdsToDelete.forEach((rid) => store.hiddenRouteIds.delete(rid));
  syncCountersFromLoadedFeatures();
  bumpRoutesGeometryRevision();
  refreshSources();
}

function setLineHidden(groupId, hidden) {
  const routeIds = store.routesFC.features.filter((f) => f.properties.group_id === groupId).map((f) => f.properties.route_id);
  if (!routeIds.length) return;
  routeIds.forEach((rid) => {
    if (hidden) store.hiddenRouteIds.add(rid);
    else store.hiddenRouteIds.delete(rid);
  });
  refreshSources();
  if (hidden) {
    clearHover();
  }
}

function isLineHidden(groupId) {
  const routeIds = store.routesFC.features.filter((f) => f.properties.group_id === groupId).map((f) => f.properties.route_id);
  if (!routeIds.length) return false;
  return routeIds.every((rid) => store.hiddenRouteIds.has(rid));
}

function startNewTempRoute() {
  store.hiddenRouteIds.clear();
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  store.temp.editingSessions = [{ routeId: null, nodes: [] }];
  refreshSources();
}

function startEditLine(groupId) {
  const routesInGroup = store.routesFC.features.filter((f) => f.properties.group_id === groupId);
  if (!routesInGroup.length) return;
  store.temp.editingSessions = [];
  store.temp.queuedStations = [];
  routesInGroup.forEach((route) => {
    store.temp.editingSessions.push({
      routeId: route.properties.route_id,
      nodes: route.geometry.coordinates.slice(),
    });
    store.hiddenRouteIds.add(route.properties.route_id);
  });
  refreshSources();
}

function endTempEditingAndCommit() {
  if (!store.temp.editingSessions || store.temp.editingSessions.length === 0) {
    return { ok: true, newLineIds: [] };
  }

  const newRouteIdMap = new Map();
  const newLineIds = [];

  store.temp.editingSessions.forEach((session) => {
    const { routeId, nodes } = session;
    if (nodes.length < 2) return;

    if (routeId) {
      const routeFeature = store.routesFC.features.find((x) => x.properties.route_id === routeId);
      if (!routeFeature) return;
      routeFeature.geometry.coordinates = nodes;
      const newLine = T.lineString(nodes);
      store.stationsFC.features.forEach((station) => {
        if (station.properties.route_id === routeId) {
          const snapped = T.nearestPointOnLine(newLine, station.geometry.coordinates);
          station.geometry.coordinates = snapped.geometry.coordinates;
        }
      });
    } else {
      const new_route_id = nextRouteId();
      const new_group_id = nextGroupId();
      const defaultLine = allocateDefaultLineLabel(store.routesFC.features, isUserRouteFeature);
      newRouteIdMap.set(session, new_route_id);
      newLineIds.push(new_group_id);
      store.routesFC.features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: nodes },
        properties: {
          route_id: new_route_id,
          group_id: new_group_id,
          name: defaultLine.name,
          user_default_line_label: defaultLine.user_default_line_label,
          route_kind: ROUTE_KIND_USER,
          country: "",
          region: "",
          status: ROUTE_STATUS_CUSTOM,
        },
      });
      ensureEndpointStations(new_route_id, nodes);
    }
  });

  if (store.temp.previewStations && store.temp.previewStations.length) {
    store.temp.previewStations.forEach((sid) => {
      const st = store.stationsFC.features.find((f) => f.properties.station_id === sid);
      if (st) {
        let closestRouteId = null;
        let minDistance = Infinity;

        store.temp.editingSessions.forEach((session) => {
          if (session.nodes.length < 1) return;
          const line = T.lineString(session.nodes);
          const snapped = T.nearestPointOnLine(line, st.geometry.coordinates);
          if (snapped.properties.dist < minDistance) {
            minDistance = snapped.properties.dist;
            closestRouteId = session.routeId || newRouteIdMap.get(session);
          }
        });
        if (closestRouteId) st.properties.route_id = closestRouteId;
      }
    });
  }

  if (store.temp.queuedStations && store.temp.queuedStations.length) {
    store.temp.queuedStations.forEach((q) => {
      if (q?.kind !== "transfer-link") return;
      const st = store.stationsFC.features.find((f) => f.properties?.station_id === q.station_id);
      if (!st || !st.properties?.is_transfer_fixed) return;

      const routeId = q.session?.routeId || newRouteIdMap.get(q.session);
      if (!routeId) return;

      const next = new Set(st.properties.transfer_routes || []);
      next.add(routeId);
      st.properties.transfer_routes = Array.from(next);
    });
  }

  store.hiddenRouteIds.clear();
  store.temp.editingSessions = [];
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  normalizeAllTransferStations();
  syncCountersFromLoadedFeatures();
  normalizeUserDefaultNames();
  bumpRoutesGeometryRevision();
  refreshSources();
  return { ok: true, newLineIds };
}

function cancelTempEditing() {
  const previewIds = new Set(store.temp.previewStations || []);
  store.stationsFC.features = store.stationsFC.features.filter((s) => {
    const sid = s.properties?.station_id;
    if (sid && previewIds.has(sid)) return false;
    if (s.properties?.route_id === "__temp_preview__") return false;
    return true;
  });

  store.hiddenRouteIds.clear();
  store.temp.editingSessions = [];
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  store.temp.routeIdEditing = null;
  syncCountersFromLoadedFeatures();
  refreshSources();
  return { ok: true };
}

function getLineStatus(groupId) {
  const route = store.routesFC.features.find((f) => f.properties?.group_id === groupId);
  return normalizeStatus(route?.properties?.status);
}

function setLineStatus(groupId, status) {
  const next = normalizeStatus(status);
  const routes = store.routesFC.features.filter((f) => f.properties.group_id === groupId);
  if (!routes.length) return;
  for (const f of routes) {
    f.properties.status = next;
  }
  refreshSources();
}

function addTempNodeAt(coord, routeId, insertIndex = null) {
  const session = routeId ? store.temp.editingSessions.find((s) => s.routeId === routeId) : store.temp.editingSessions[0];
  if (!session) return;
  if (insertIndex === null) session.nodes.push(coord);
  else session.nodes.splice(insertIndex, 0, coord);
  refreshSources();
}

function deleteTempNodeByIndex(idx, routeId) {
  const session = routeId ? store.temp.editingSessions.find((s) => s.routeId === routeId) : store.temp.editingSessions[0];
  if (!session || idx < 0 || idx >= session.nodes.length) return;
  session.nodes.splice(idx, 1);
  refreshSources();
}

function updateTempNodeCoord(idx, coord, routeId) {
  const session = routeId ? store.temp.editingSessions.find((s) => s.routeId === routeId) : store.temp.editingSessions[0];
  if (!session || idx < 0 || idx >= session.nodes.length) return false;
  session.nodes[idx] = coord;
  return true;
}

function moveTempNode(idx, coord, routeId, options = {}) {
  if (!updateTempNodeCoord(idx, coord, routeId)) return;
  if (options.preview) refreshTempEditSources();
  else refreshSources();
}

function insertTempNodeOnSegment(pointPx, routeId) {
  const map = getMap();
  const session = routeId ? store.temp.editingSessions.find((s) => s.routeId === routeId) : store.temp.editingSessions[0];
  if (!map || !session || session.nodes.length < 2) return;
  const lngLat = map.unproject(pointPx);
  const line = T.lineString(session.nodes);
  const snapped = T.nearestPointOnLine(line, [lngLat.lng, lngLat.lat], { units: "meters" });
  const insertIdx = snapped.properties.index + 1;
  addTempNodeAt(snapped.geometry.coordinates, session.routeId, insertIdx);
}

function addStationAt(route_id, coord, name = null, color = null, extraProps = {}, options = {}) {
  const station_id = nextStationId();
  const defaultStation = allocateDefaultStationLabel(store.stationsFC.features, isUserStationFeature);
  const stationName = name || defaultStation.name;
  const props = { station_id, route_id, name: stationName, color: color, ...extraProps };
  if (!name) props.user_default_label = defaultStation.user_default_label;
  store.stationsFC.features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: coord },
    properties: props,
  });
  if (!options.skipRefresh) refreshSources();
  return station_id;
}

function expandMergedRouteIdsFromStation(station, mergedRouteIds) {
  if (typeof station?.properties?.route_id === "string") mergedRouteIds.add(station.properties.route_id);
  const transferRoutes = station?.properties?.transfer_routes;
  if (Array.isArray(transferRoutes)) {
    transferRoutes.forEach((rid) => {
      if (typeof rid === "string") mergedRouteIds.add(rid);
    });
  }
}

/** 轉乘點應吸收的一般站（含重疊的 s5/s6、路線頭尾站）。 */
function collectStationIdsToAbsorbForTransfer(coord, mergedRouteIds) {
  const toRemove = new Set();
  const routeIds = new Set(mergedRouteIds);
  const transferPoint = T.point(coord);

  const markForAbsorb = (s) => {
    if (!s?.properties?.station_id) return;
    if (s.properties.is_transfer_fixed) return;
    toRemove.add(s.properties.station_id);
    expandMergedRouteIdsFromStation(s, routeIds);
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

  for (const routeId of routeIds) {
    const route = store.routesFC.features.find((f) => f.properties.route_id === routeId);
    if (!route?.geometry?.coordinates || route.geometry.coordinates.length < 2) continue;
    const coords = route.geometry.coordinates;
    const line = T.lineString(coords);
    const ends = [coords[0], coords[coords.length - 1]];

    for (const endCoord of ends) {
      const endNearTransfer =
        T.distance(T.point(endCoord), transferPoint, { units: "meters" }) <= TRANSFER_ABSORB_METERS;
      if (!endNearTransfer) continue;

      for (const s of store.stationsFC.features) {
        if (s.properties?.route_id !== routeId) continue;
        const sc = s.geometry.coordinates;
        const dEnd = T.distance(T.point(sc), T.point(endCoord), { units: "meters" });
        const dTr = T.distance(T.point(sc), transferPoint, { units: "meters" });
        if (dEnd <= TRANSFER_ABSORB_METERS || dTr <= TRANSFER_ABSORB_METERS) markForAbsorb(s);
      }
    }

    for (const s of store.stationsFC.features) {
      if (s.properties?.route_id !== routeId) continue;
      if (s.properties?.is_transfer_fixed) continue;
      const snapped = T.nearestPointOnLine(line, s.geometry.coordinates, { units: "meters" });
      const dAlong = snapped.properties.dist ?? Infinity;
      const dToTransfer = T.distance(T.point(s.geometry.coordinates), transferPoint, { units: "meters" });
      if (dAlong <= TRANSFER_ABSORB_METERS && dToTransfer <= TRANSFER_ABSORB_METERS) markForAbsorb(s);
    }
  }

  return { stationIds: toRemove, routeIds };
}

function hasTransferCoveringRoutePoint(routeId, pt, radiusMeters = TRANSFER_ABSORB_METERS) {
  const p = T.point(pt);
  return store.stationsFC.features.some((s) => {
    if (!s.properties?.is_transfer_fixed) return false;
    const routes = s.properties.transfer_routes || [];
    const coversRoute =
      s.properties.route_id === routeId || (Array.isArray(routes) && routes.includes(routeId));
    if (!coversRoute) return false;
    return T.distance(T.point(s.geometry.coordinates), p, { units: "meters" }) <= radiusMeters;
  });
}

function applyTransferAbsorption(coord, mergedRouteIds) {
  const { stationIds, routeIds } = collectStationIdsToAbsorbForTransfer(coord, mergedRouteIds);
  store.stationsFC.features = store.stationsFC.features.filter(
    (s) => !stationIds.has(s.properties.station_id),
  );
  return routeIds;
}

function normalizeAllTransferStations() {
  const transfers = store.stationsFC.features.filter((s) => s.properties?.is_transfer_fixed);
  for (const tr of transfers) {
    const coord = tr.geometry.coordinates;
    const routes = new Set(
      Array.isArray(tr.properties.transfer_routes) ? tr.properties.transfer_routes.filter(Boolean) : [],
    );
    if (typeof tr.properties.route_id === "string") routes.add(tr.properties.route_id);
    const routeIds = applyTransferAbsorption(coord, routes);
    tr.properties.transfer_routes = Array.from(routeIds);
    tr.properties.is_transfer_fixed = true;
  }
}

function addTransferStationAt(coord, routeIdA, routeIdB) {
  const mergedRouteIds = new Set([routeIdA, routeIdB]);
  const nearbyStations = store.stationsFC.features.filter((s) => {
    return T.distance(T.point(s.geometry.coordinates), T.point(coord), { units: "meters" }) <= TRANSFER_ABSORB_METERS;
  });
  nearbyStations.forEach((s) => expandMergedRouteIdsFromStation(s, mergedRouteIds));

  const existingTransfer = nearbyStations.find((s) => s.properties?.is_transfer_fixed);
  const finalRouteIds = applyTransferAbsorption(coord, mergedRouteIds);

  const routeFeature = store.routesFC.features.find((f) => f.properties.route_id === routeIdA);
  const color = routeFeature?.properties?.color || "#5e35b1";
  if (existingTransfer) {
    existingTransfer.geometry.coordinates = coord;
    existingTransfer.properties.route_id = routeIdA;
    existingTransfer.properties.color = color;
    existingTransfer.properties.is_transfer_fixed = true;
    existingTransfer.properties.transfer_routes = Array.from(finalRouteIds);
    normalizeAllTransferStations();
    refreshSources();
    return existingTransfer.properties.station_id;
  }

  const stationId = addStationAt(routeIdA, coord, null, color, {
    is_transfer_fixed: true,
    transfer_routes: Array.from(finalRouteIds),
  });
  normalizeAllTransferStations();
  refreshSources();
  return stationId;
}

function removeStation(station_id) {
  const st = store.stationsFC.features.find((f) => f.properties.station_id === station_id);
  if (!st) return false;
  const rid = st.properties.route_id;
  const count = store.stationsFC.features.filter((f) => f.properties.route_id === rid).length;
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
  const rid = st.properties.route_id;
  const route = store.routesFC.features.find((f) => f.properties.route_id === rid);
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

function ensureEndpointStations(route_id, coords) {
  const ends = [coords[0], coords[coords.length - 1]];
  ends.forEach((pt) => {
    if (hasTransferCoveringRoutePoint(route_id, pt)) return;
    const exists = store.stationsFC.features.some((f) => {
      if (f.properties?.is_transfer_fixed) return false;
      return T.distance(T.point(f.geometry.coordinates), T.point(pt), { units: "meters" }) <= 5;
    });
    if (!exists) addStationAt(route_id, pt, null, null, {}, { skipRefresh: true });
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
      addTempNodeAt(coord, session.routeId, 0);
    } else {
      addTempNodeAt(coord, session.routeId);
    }
  } else {
    addTempNodeAt(coord, session.routeId);
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

function mergeRoutes(routeIdA, routeIdB) {
  if (routeIdA === routeIdB) return { ok: false, msg: t("routeModel.mergeDifferent") };
  const routeA_feature = store.routesFC.features.find((f) => f.properties.route_id === routeIdA);
  const routeB_feature = store.routesFC.features.find((f) => f.properties.route_id === routeIdB);
  if (!routeA_feature || !routeB_feature) return { ok: false, msg: t("routeModel.mergeNotFound") };

  const lineA = T.lineString(routeA_feature.geometry.coordinates);
  const lineB = T.lineString(routeB_feature.geometry.coordinates);
  const coordsA = routeA_feature.geometry.coordinates;
  const coordsB = routeB_feature.geometry.coordinates;
  const checks = [
    { sourcePoint: T.point(coordsA[0]), targetLine: lineB, sourceRouteId: routeIdA, targetRouteId: routeIdB },
    { sourcePoint: T.point(coordsA[coordsA.length - 1]), targetLine: lineB, sourceRouteId: routeIdA, targetRouteId: routeIdB },
    { sourcePoint: T.point(coordsB[0]), targetLine: lineA, sourceRouteId: routeIdB, targetRouteId: routeIdA },
    { sourcePoint: T.point(coordsB[coordsB.length - 1]), targetLine: lineA, sourceRouteId: routeIdB, targetRouteId: routeIdA },
  ];
  let bestConnection = { dist: Infinity };
  for (const check of checks) {
    const snapped = T.nearestPointOnLine(check.targetLine, check.sourcePoint, { units: "meters" });
    if (snapped.properties.dist < bestConnection.dist) {
      bestConnection = {
        dist: snapped.properties.dist,
        snappedPoint: snapped.geometry.coordinates,
        sourceRouteId: check.sourceRouteId,
        targetRouteId: check.targetRouteId,
      };
    }
  }
  if (bestConnection.dist <= 5) {
    let stationToRemoveId = null;
    let minStationDist = Infinity;
    store.stationsFC.features.forEach((station) => {
      if (station.properties.route_id === bestConnection.targetRouteId) {
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
  const targetLineId = routeA_feature.properties.group_id;
  const sourceLineId = routeB_feature.properties.group_id;

  // Merge whole lines (not a single sub-route pick), so selection order does not split lines.
  if (sourceLineId !== targetLineId) {
    store.routesFC.features.forEach((route) => {
      if (route.properties.group_id === sourceLineId) {
        route.properties.group_id = targetLineId;
      }
    });
  }

  syncLineSubRouteMetadata(targetLineId, routeA_feature.properties);

  const unifiedColor = routeA_feature.properties.color || routeB_feature.properties.color || "#1e88e5";
  setLineColor(targetLineId, unifiedColor);
  syncCountersFromLoadedFeatures();
  return { ok: true };
}

function splitLine(routeId) {
  const target = store.routesFC.features.find((f) => f.properties.route_id === routeId);
  if (!target) return { ok: false, msg: t("routeModel.splitLineNotFound") };

  const groupId = target.properties.group_id;
  const routesInGroup = store.routesFC.features.filter((f) => f.properties.group_id === groupId);
  if (routesInGroup.length <= 1) {
    return { ok: false, msg: t("routeModel.splitLineSingle") };
  }

  routesInGroup.forEach((route) => {
    route.properties.group_id = nextGroupId();
  });
  normalizeUserDefaultNames();
  bumpRoutesGeometryRevision();
  refreshSources();
  return { ok: true };
}

function setRouteColor(routeId, color) {
  const routeFeature = store.routesFC.features.find((f) => f.properties.route_id === routeId);
  if (routeFeature) {
    routeFeature.properties.color = color;
    store.stationsFC.features.forEach((station) => {
      if (station.properties.route_id === routeId) {
        station.properties.color = color;
      }
    });
    refreshSources();
  }
}

function setLineColor(groupId, color) {
  const routesInGroup = store.routesFC.features.filter((f) => f.properties.group_id === groupId);
  if (!routesInGroup.length) return;
  const routeIdsInGroup = routesInGroup.map((f) => f.properties.route_id);
  routesInGroup.forEach((route) => {
    route.properties.color = color;
  });
  store.stationsFC.features.forEach((station) => {
    if (routeIdsInGroup.includes(station.properties.route_id)) {
      station.properties.color = color;
    }
  });
  refreshSources();
}

function setLineName(groupId, newName) {
  const next = clampName15(newName);
  store.routesFC.features.forEach((f) => {
    if (f.properties.group_id === groupId) {
      f.properties.name = next;
      if (shouldClearLineLabelOnRename(next, f.properties.route_id, f.properties.user_default_line_label)) {
        delete f.properties.user_default_line_label;
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

function setLineMetadata(groupId, patch) {
  if (!patch || typeof patch !== "object") return;
  const routes = store.routesFC.features.filter((f) => f.properties.group_id === groupId);
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
  if (feature?.properties?.route_id === "__temp_preview__") return null;
  const c = JSON.parse(JSON.stringify(feature));
  if (!c.properties || typeof c.properties !== "object") c.properties = {};
  for (const key of DISPLAY_ONLY_STATION_PROPS) {
    delete c.properties[key];
  }
  delete c.properties.label_lnglat;
  delete c.properties.label_is_manual;
  return c;
}

function buildUserExportPayload(groupIds) {
  const groupIdSet = Array.isArray(groupIds) && groupIds.length > 0 ? new Set(groupIds) : null;
  let userRouteFeatures = store.routesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
  if (groupIdSet) {
    userRouteFeatures = userRouteFeatures.filter((f) => groupIdSet.has(f.properties.group_id));
  }
  const userRoutes = userRouteFeatures.map(sanitizeRouteForExport);
  const userRouteIds = new Set(userRoutes.map((f) => f.properties.route_id));
  const userStations = extractUserStationsByRoutes(store.stationsFC.features, userRouteIds)
    .map(sanitizeStationForExport)
    .filter(Boolean);
  const hiddenRouteIds = Array.from(store.hiddenRouteIds).filter((id) => userRouteIds.has(id));
  const mapView = computeMapViewFromFeatures(userRoutes, userStations);
  return {
    format: EXPORT_FILE_FORMAT,
    formatVersion: PERSIST_VERSION,
    exportedAt: new Date().toISOString(),
    v: PERSIST_VERSION,
    userRoutesFC: { type: "FeatureCollection", features: userRoutes },
    userStationsFC: { type: "FeatureCollection", features: userStations },
    hiddenRouteIds,
    counters: { ...store.counters },
    settings: { ...store.settings },
    ...(mapView ? { mapView } : {}),
  };
}

function hasUserContent() {
  return store.routesFC.features.some((f) => routeKindOf(f) === ROUTE_KIND_USER);
}

function clearUserContent() {
  const userRouteIds = new Set(
    store.routesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER).map((f) => f.properties.route_id)
  );
  store.routesFC.features = store.routesFC.features.filter((f) => routeKindOf(f) !== ROUTE_KIND_USER);
  store.stationsFC.features = store.stationsFC.features.filter((s) => {
    const rid = s?.properties?.route_id;
    if (rid === "__temp_preview__") return false;
    if (userRouteIds.has(rid)) return false;
    const transferRoutes = s?.properties?.transfer_routes;
    return !(Array.isArray(transferRoutes) && transferRoutes.some((tr) => userRouteIds.has(tr)));
  });
  userRouteIds.forEach((rid) => store.hiddenRouteIds.delete(rid));
  store.temp.editingSessions = [];
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  store.temp.routeIdEditing = null;
  syncCountersFromLoadedFeatures();
}

function getExistingUserLineIdSet() {
  const ids = new Set();
  for (const f of store.routesFC.features) {
    if (routeKindOf(f) !== ROUTE_KIND_USER) continue;
    const gid = f.properties?.group_id;
    if (typeof gid === "string") ids.add(gid);
  }
  return ids;
}

/** `group_id` values in the import file that already exist among user lines. */
function getImportDuplicateLineIds(userRoutes) {
  const existing = getExistingUserLineIdSet();
  const duplicates = [];
  const seen = new Set();
  for (const f of userRoutes) {
    const gid = f.properties?.group_id;
    if (typeof gid !== "string" || !existing.has(gid) || seen.has(gid)) continue;
    seen.add(gid);
    duplicates.push(gid);
  }
  return duplicates.sort((a, b) => a.localeCompare(b, "en"));
}

function deleteUserLinesByIds(groupIds) {
  if (!Array.isArray(groupIds) || !groupIds.length) return;
  const idSet = new Set(groupIds);
  const toDelete = [];
  const seen = new Set();
  for (const f of store.routesFC.features) {
    if (routeKindOf(f) !== ROUTE_KIND_USER) continue;
    const gid = f.properties?.group_id;
    if (typeof gid === "string" && idSet.has(gid) && !seen.has(gid)) {
      seen.add(gid);
      toDelete.push(gid);
    }
  }
  if (toDelete.length) deleteLines(toDelete);
}

function countSubRoutesInLinesByIds(userRoutes, groupIds) {
  const idSet = new Set(groupIds);
  return userRoutes.filter((f) => idSet.has(f.properties?.group_id)).length;
}

function buildImportResultStats(userRoutes, userStations, mode, duplicateLineIds) {
  const importLineIds = new Set();
  for (const f of userRoutes) {
    const gid = f.properties?.group_id;
    if (typeof gid === "string") importLineIds.add(gid);
  }
  const duplicateSet = new Set(duplicateLineIds);
  const addedLineIds = [...importLineIds].filter((id) => !duplicateSet.has(id));
  const replacedSubRouteCount = countSubRoutesInLinesByIds(userRoutes, duplicateLineIds);
  const addedSubRouteCount = countSubRoutesInLinesByIds(userRoutes, addedLineIds);

  return {
    mode,
    subRouteCount: userRoutes.length,
    stationCount: userStations.length,
    lineCount: importLineIds.size,
    replacedLineCount: duplicateLineIds.length,
    addedLineCount: addedLineIds.length,
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
  const allRoutes = Array.isArray(data.userRoutesFC?.features)
    ? data.userRoutesFC.features
    : Array.isArray(data.routesFC?.features)
      ? data.routesFC.features
      : null;
  const allStations = Array.isArray(data.userStationsFC?.features)
    ? data.userStationsFC.features
    : Array.isArray(data.stationsFC?.features)
      ? data.stationsFC.features
      : null;
  if (!allRoutes || !allStations) {
    throw new Error("missing_features");
  }
  const userRoutes = extractUserOnlyRoutes(allRoutes);
  const userRouteIds = new Set(userRoutes.map((f) => f?.properties?.route_id).filter((id) => typeof id === "string"));
  const userStations = extractUserStationsByRoutes(allStations, userRouteIds)
    .map(sanitizeStationForExport)
    .filter(Boolean);
  const mapView =
    normalizeImportedMapView(data.mapView) ??
    normalizeImportedMapView(data.mapCenter) ??
    computeMapViewFromFeatures(userRoutes, userStations);

  return {
    userRoutes,
    userStations,
    hiddenRouteIds: Array.isArray(data.hiddenRouteIds) ? data.hiddenRouteIds : [],
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

function getExportFileNameForSelectedLines(lineCount) {
  return `metro-map-selected-${lineCount}-${exportStamp()}.json`;
}

/**
 * @param {string[]} lineIds
 * @returns {{ ok: true, json: string, fileName: string } | { ok: false, error: string }}
 */
function exportLinesJSON(lineIds) {
  if (!Array.isArray(lineIds) || lineIds.length === 0) {
    return { ok: false, error: "no_lines" };
  }
  const payload = buildUserExportPayload(lineIds);
  if (!payload.userRoutesFC.features.length) {
    return { ok: false, error: "no_user_routes" };
  }
  return {
    ok: true,
    json: JSON.stringify(payload, null, 2),
    fileName: getExportFileNameForSelectedLines(lineIds.length),
  };
}

/**
 * @param {string} jsonString
 * @returns {{ ok: true, duplicateLineIds: string[] } | { ok: false, error: string }}
 */
function analyzeImportJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    const { userRoutes } = parseImportPayload(data);
    return { ok: true, duplicateLineIds: getImportDuplicateLineIds(userRoutes) };
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
    const { userRoutes, userStations, hiddenRouteIds, counters, settings, mapView } = parseImportPayload(data);
    const mode = options.mode ?? "merge";
    const duplicateLineIds =
      mode === "replaceMatching" ? getImportDuplicateLineIds(userRoutes) : [];
    if (mode === "replaceAll") {
      clearUserContent();
    } else if (mode === "replaceMatching") {
      deleteUserLinesByIds(duplicateLineIds);
    }
    mergeUserStateIntoStore(userRoutes, userStations);
    if (Array.isArray(hiddenRouteIds)) {
      for (const rid of hiddenRouteIds) {
        if (typeof rid === "string") store.hiddenRouteIds.add(rid);
      }
    }
    if (settings && typeof settings.stationMinPerRoute === "number") {
      store.settings.stationMinPerRoute = settings.stationMinPerRoute;
    }
    syncCountersFromLoadedFeatures();
    normalizeAllRoutesMetadata();
    normalizeUserDefaultNames();
    lastImportUndoSnapshot = snapshotBeforeImport;
    refreshSources();
    notifyImportUndoListeners();
    scheduleImportMapView(mapView);
    return { ok: true, mapView, ...buildImportResultStats(userRoutes, userStations, mode, duplicateLineIds) };
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
  getLineList,
  getLineStatus,
  setLineStatus,
  getActiveEditLineId,
  /** @deprecated use getActiveEditLineId */
  getActiveEditGroupId: getActiveEditLineId,
  setLineMetadata,
  deleteRoute,
  deleteLine,
  deleteLines,
  setLineHidden,
  isLineHidden,
  highlightRoute,
  clearHover,
  startNewTempRoute,
  startEditLine,
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
  setRouteColor,
  setLineColor,
  setLineName,
  setStationName,
  setStationLabelPosition,
  resolveLineDisplayName,
  resolveLineDisplayNameFromProps,
  resolveStationDisplayName,
  refreshSources,
  refreshTempEditSources,
  refreshTransferSnapSource,
  hasUserContent,
  analyzeImportJSON,
  exportUserStateJSON,
  exportLinesJSON,
  getExportFileName,
  importUserStateJSON,
  canUndoLastImport,
  undoLastImport,
  subscribeImportUndoAvailability,
  _store: store,
};
