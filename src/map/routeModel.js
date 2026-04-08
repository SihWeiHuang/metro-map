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

const PERSIST_STORAGE_KEY = "metro-map-data-v1";
const PERSIST_VERSION = 1;

/** Ensure new ids never collide after loading from disk. */
function syncCountersFromLoadedFeatures() {
  let maxR = 0;
  let maxG = 0;
  let maxS = 0;
  for (const f of store.routesFC.features) {
    const rid = f.properties?.route_id;
    const gid = f.properties?.group_id;
    if (typeof rid === "string" && /^r\d+$/.test(rid)) {
      maxR = Math.max(maxR, parseInt(rid.slice(1), 10));
    }
    if (typeof gid === "string" && /^g\d+$/.test(gid)) {
      maxG = Math.max(maxG, parseInt(gid.slice(1), 10));
    }
  }
  for (const f of store.stationsFC.features) {
    const sid = f.properties?.station_id;
    if (typeof sid === "string" && /^s\d+$/.test(sid)) {
      maxS = Math.max(maxS, parseInt(sid.slice(1), 10));
    }
  }
  store.counters.route = Math.max(store.counters.route, maxR + 1);
  store.counters.group = Math.max(store.counters.group, maxG + 1);
  store.counters.station = Math.max(store.counters.station, maxS + 1);
}

function loadPersistedState() {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(PERSIST_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || data.v !== PERSIST_VERSION) return;
    if (Array.isArray(data.routesFC?.features)) {
      store.routesFC = { type: "FeatureCollection", features: data.routesFC.features };
    }
    if (Array.isArray(data.stationsFC?.features)) {
      store.stationsFC = { type: "FeatureCollection", features: data.stationsFC.features };
    }
    if (Array.isArray(data.hiddenRouteIds)) {
      store.hiddenRouteIds = new Set(data.hiddenRouteIds);
    }
    if (data.counters && typeof data.counters === "object") {
      if (Number.isFinite(data.counters.route)) store.counters.route = data.counters.route;
      if (Number.isFinite(data.counters.group)) store.counters.group = data.counters.group;
      if (Number.isFinite(data.counters.station)) store.counters.station = data.counters.station;
    }
    if (data.settings && typeof data.settings.stationMinPerRoute === "number") {
      store.settings.stationMinPerRoute = data.settings.stationMinPerRoute;
    }
    syncCountersFromLoadedFeatures();
    normalizeAllRoutesMetadata();
  } catch (_) {
    /* ignore corrupt storage */
  }
}

loadPersistedState();

let persistTimer = null;
function schedulePersistToStorage() {
  if (typeof localStorage === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const payload = {
        v: PERSIST_VERSION,
        routesFC: store.routesFC,
        stationsFC: store.stationsFC,
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

const nextRouteId = () => `r${store.counters.route++}`;
const nextGroupId = () => `g${store.counters.group++}`;
const nextStationId = () => `s${store.counters.station++}`;
const TRANSFER_DEDUP_METERS = 4;

/** 游標與黃色吸附點距離 ≤ 此值（公尺）時視為「吸附」，可調整吸附強弱。 */
export const TRANSFER_SNAP_HOVER_METERS = 22;
/** 點擊路線時，與交叉吸附點距離 ≤ 此值（公尺）則改為新增轉乘站（略大於 hover 較好點）。 */
export const TRANSFER_SNAP_CLICK_METERS = 30;

const NAME_MAX_LEN = 15;
function clampName15(v) {
  return String(v ?? "").slice(0, NAME_MAX_LEN);
}

/** 內建（免費展示）路線；未來由官方資料匯入時使用。 */
export const ROUTE_KIND_DEFAULT = "default";
/** 使用者自行繪製的路線（付費／編輯產生）。 */
export const ROUTE_KIND_USER = "user";

function normalizeRouteProperties(p) {
  if (!p || typeof p !== "object") return;
  if (p.route_kind !== ROUTE_KIND_DEFAULT && p.route_kind !== ROUTE_KIND_USER) {
    p.route_kind = ROUTE_KIND_USER;
  }
  if (typeof p.country !== "string") p.country = "";
  if (typeof p.region !== "string") p.region = "";
}

function normalizeAllRoutesMetadata() {
  for (const f of store.routesFC.features) {
    normalizeRouteProperties(f.properties);
  }
}

function syncGroupRouteMetadata(groupId, sourceProps) {
  const kind =
    sourceProps?.route_kind === ROUTE_KIND_DEFAULT || sourceProps?.route_kind === ROUTE_KIND_USER
      ? sourceProps.route_kind
      : ROUTE_KIND_USER;
  const country = typeof sourceProps?.country === "string" ? sourceProps.country : "";
  const region = typeof sourceProps?.region === "string" ? sourceProps.region : "";
  store.routesFC.features.forEach((f) => {
    if (f.properties.group_id !== groupId) return;
    f.properties.route_kind = kind;
    f.properties.country = country;
    f.properties.region = region;
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

function buildTransferSnapPointsFC() {
  const features = [];
  const seen = [];
  const routes = store.routesFC.features.filter((f) => f.geometry?.type === "LineString" && f.geometry.coordinates.length >= 2);

  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i];
      const b = routes[j];
      const lineA = T.lineString(smoothLineStringForDisplay(a.geometry.coordinates));
      const lineB = T.lineString(smoothLineStringForDisplay(b.geometry.coordinates));
      const intersections = T.lineIntersect(lineA, lineB);

      intersections.features.forEach((pt) => {
        const c = pt.geometry.coordinates;
        const isDup = seen.some((prev) => T.distance(T.point(prev), T.point(c), { units: "meters" }) < TRANSFER_DEDUP_METERS);
        if (isDup) return;
        seen.push(c);
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: c },
          properties: {
            snap_id: `x_${a.properties.route_id}_${b.properties.route_id}_${features.length}`,
            route_id_a: a.properties.route_id,
            route_id_b: b.properties.route_id,
          },
        });
      });
    }
  }
  return { type: "FeatureCollection", features };
}

function refreshSources() {
  schedulePersistToStorage();

  const map = getMap();
  if (!map) return;
  const { stationsDisplayFC, stationLabelsFC } = buildStationDisplayCollections(store.stationsFC, store.routesFC);
  map.getSource("routes") &&
    map.getSource("routes").setData(featureCollectionWithSmoothedLineStrings(store.routesFC));
  map.getSource("stations") && map.getSource("stations").setData(stationsDisplayFC);
  map.getSource("station-labels") && map.getSource("station-labels").setData(stationLabelsFC);
  map.getSource("transfer-snaps") && map.getSource("transfer-snaps").setData(buildTransferSnapPointsFC());

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

  map.getSource("temp-edit-line") &&
    map.getSource("temp-edit-line").setData({
      type: "FeatureCollection",
      features: tempLineFeaturesWithSmoothedGeometry(tempLines),
    });

  map.getSource("temp-edit-nodes") &&
    map.getSource("temp-edit-nodes").setData({ type: "FeatureCollection", features: tempNodes });

  const hiddenIds = Array.from(store.hiddenRouteIds);
  const visibleRouteIds = Array.from(
    new Set(store.routesFC.features.map((f) => f.properties.route_id).filter((rid) => !store.hiddenRouteIds.has(rid)))
  );
  const transferAnyVisibleExpr = visibleRouteIds.length
    ? ["any", ...visibleRouteIds.map((rid) => ["in", rid, ["coalesce", ["get", "transfer_routes"], ["literal", []]]])]
    : false;
  const stationVisibleFilter = ["any", ["in", ["get", "route_id"], ["literal", visibleRouteIds]], transferAnyVisibleExpr];
  if (map.getLayer("stations-circle")) {
    map.setFilter("stations-circle", stationVisibleFilter);
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
    map.setFilter("stations-circle-hover", stationHoverFilter);

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
  map.getLayer("stations-label-hover") && map.setFilter("stations-label-hover", ["==", ["get", "station_id"], ""]);
}

function getGroupList() {
  const groups = {};
  store.routesFC.features.forEach((f) => {
    const p = f.properties;
    const rk =
      p.route_kind === ROUTE_KIND_DEFAULT || p.route_kind === ROUTE_KIND_USER ? p.route_kind : ROUTE_KIND_USER;
    const country = typeof p.country === "string" ? p.country : "";
    const region = typeof p.region === "string" ? p.region : "";
    if (!groups[p.group_id]) groups[p.group_id] = [];
    groups[p.group_id].push({
      route_id: p.route_id,
      name: p.name || t("routeModel.routeDefault", { id: p.route_id }),
      color: p.color || "#1e88e5",
      route_kind: rk,
      country,
      region,
    });
  });
  return Object.entries(groups).map(([group_id, routes]) => {
    const head = routes[0];
    return {
      group_id,
      routes,
      route_kind: head?.route_kind ?? ROUTE_KIND_USER,
      country: head?.country ?? "",
      region: head?.region ?? "",
    };
  });
}

function getActiveEditGroupId() {
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
  refreshSources();
}

function deleteGroup(groupId) {
  const routeIdsInGroup = store.routesFC.features.filter((f) => f.properties.group_id === groupId).map((f) => f.properties.route_id);

  if (routeIdsInGroup.length === 0) return;

  store.routesFC.features = store.routesFC.features.filter((f) => f.properties.group_id !== groupId);
  store.stationsFC.features = store.stationsFC.features.filter((f) => !routeIdsInGroup.includes(f.properties.route_id));
  routeIdsInGroup.forEach((rid) => store.hiddenRouteIds.delete(rid));
  refreshSources();
}

function deleteGroups(groupIds) {
  if (!Array.isArray(groupIds) || groupIds.length === 0) return;
  const idSet = new Set(groupIds);
  const routeIdsToDelete = store.routesFC.features
    .filter((f) => idSet.has(f.properties.group_id))
    .map((f) => f.properties.route_id);
  if (!routeIdsToDelete.length) return;

  store.routesFC.features = store.routesFC.features.filter((f) => !idSet.has(f.properties.group_id));
  store.stationsFC.features = store.stationsFC.features.filter((f) => !routeIdsToDelete.includes(f.properties.route_id));
  routeIdsToDelete.forEach((rid) => store.hiddenRouteIds.delete(rid));
  refreshSources();
}

function setGroupHidden(groupId, hidden) {
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

function isGroupHidden(groupId) {
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

function startEditGroup(groupId) {
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
  if (!store.temp.editingSessions || store.temp.editingSessions.length === 0) return true;

  const newRouteIdMap = new Map();

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
      newRouteIdMap.set(session, new_route_id);
      store.routesFC.features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: nodes },
        properties: {
          route_id: new_route_id,
          group_id: new_group_id,
          name: t("routeModel.routeDefault", { id: new_route_id }),
          route_kind: ROUTE_KIND_USER,
          country: "",
          region: "",
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
  refreshSources();
  return true;
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

function moveTempNode(idx, coord, routeId) {
  const session = routeId ? store.temp.editingSessions.find((s) => s.routeId === routeId) : store.temp.editingSessions[0];
  if (!session || idx < 0 || idx >= session.nodes.length) return;
  session.nodes[idx] = coord;
  refreshSources();
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

function addStationAt(route_id, coord, name = null, color = null, extraProps = {}) {
  const station_id = nextStationId();
  const stationName = name || t("routeModel.stationDefault", { id: station_id });
  store.stationsFC.features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: coord },
    properties: { station_id, route_id, name: stationName, color: color, ...extraProps },
  });
  refreshSources();
  return station_id;
}

function addTransferStationAt(coord, routeIdA, routeIdB) {
  const mergeRadiusMeters = 10;
  const nearbyStations = store.stationsFC.features.filter((s) => {
    return T.distance(T.point(s.geometry.coordinates), T.point(coord), { units: "meters" }) <= mergeRadiusMeters;
  });
  const nearbyIds = new Set(nearbyStations.map((s) => s.properties.station_id));
  const mergedRouteIds = new Set([routeIdA, routeIdB]);
  nearbyStations.forEach((s) => {
    if (typeof s.properties?.route_id === "string") mergedRouteIds.add(s.properties.route_id);
    if (s.properties?.is_transfer_fixed && Array.isArray(s.properties.transfer_routes)) {
      s.properties.transfer_routes.forEach((rid) => {
        if (typeof rid === "string") mergedRouteIds.add(rid);
      });
    }
  });

  // Requirement: when creating a transfer at this point, remove original stations and keep only one transfer station.
  store.stationsFC.features = store.stationsFC.features.filter((s) => !nearbyIds.has(s.properties.station_id));
  const existingTransfer = nearbyStations.find((s) => s.properties?.is_transfer_fixed);
  const routeFeature = store.routesFC.features.find((f) => f.properties.route_id === routeIdA);
  const color = routeFeature?.properties?.color || "#5e35b1";
  if (existingTransfer) {
    existingTransfer.geometry.coordinates = coord;
    existingTransfer.properties.route_id = routeIdA;
    existingTransfer.properties.color = color;
    existingTransfer.properties.is_transfer_fixed = true;
    existingTransfer.properties.transfer_routes = Array.from(mergedRouteIds);
    store.stationsFC.features.push(existingTransfer);
    refreshSources();
    return existingTransfer.properties.station_id;
  }

  return addStationAt(routeIdA, coord, null, color, {
    is_transfer_fixed: true,
    transfer_routes: Array.from(mergedRouteIds),
  });
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
    const exists = store.stationsFC.features.some((f) => {
      return T.distance(T.point(f.geometry.coordinates), T.point(pt), { units: "meters" }) <= 5;
    });
    if (!exists) addStationAt(route_id, pt);
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
  const targetGroupId = routeA_feature.properties.group_id;
  const sourceGroupId = routeB_feature.properties.group_id;

  // Merge by whole group (not single picked route), so selection order does not split groups.
  if (sourceGroupId !== targetGroupId) {
    store.routesFC.features.forEach((route) => {
      if (route.properties.group_id === sourceGroupId) {
        route.properties.group_id = targetGroupId;
      }
    });
  }

  syncGroupRouteMetadata(targetGroupId, routeA_feature.properties);

  const unifiedColor = routeA_feature.properties.color || routeB_feature.properties.color || "#1e88e5";
  setGroupColor(targetGroupId, unifiedColor);
  return { ok: true };
}

function ungroupRoute(routeId) {
  const target = store.routesFC.features.find((f) => f.properties.route_id === routeId);
  if (!target) return { ok: false, msg: t("routeModel.ungroupNotFound") };

  const groupId = target.properties.group_id;
  const routesInGroup = store.routesFC.features.filter((f) => f.properties.group_id === groupId);
  if (routesInGroup.length <= 1) {
    return { ok: false, msg: t("routeModel.ungroupSingle") };
  }

  routesInGroup.forEach((route) => {
    route.properties.group_id = nextGroupId();
  });
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

function setGroupColor(groupId, color) {
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

function setGroupName(groupId, newName) {
  const next = clampName15(newName);
  store.routesFC.features.forEach((f) => {
    if (f.properties.group_id === groupId) {
      f.properties.name = next;
    }
  });
  refreshSources();
}

function setStationName(stationId, newName) {
  const station = store.stationsFC.features.find((f) => f.properties.station_id === stationId);
  if (station) {
    station.properties.name = clampName15(newName);
  }
  refreshSources();
}

function setGroupMetadata(groupId, patch) {
  if (!patch || typeof patch !== "object") return;
  const routes = store.routesFC.features.filter((f) => f.properties.group_id === groupId);
  if (!routes.length) return;
  for (const f of routes) {
    if (patch.route_kind === ROUTE_KIND_DEFAULT || patch.route_kind === ROUTE_KIND_USER) {
      f.properties.route_kind = patch.route_kind;
    }
    if (typeof patch.country === "string") f.properties.country = patch.country;
    if (typeof patch.region === "string") f.properties.region = patch.region;
  }
  refreshSources();
}

export const Route = {
  ROUTE_KIND_DEFAULT,
  ROUTE_KIND_USER,
  getGroupList,
  getActiveEditGroupId,
  setGroupMetadata,
  deleteRoute,
  deleteGroup,
  deleteGroups,
  setGroupHidden,
  isGroupHidden,
  highlightRoute,
  clearHover,
  startNewTempRoute,
  startEditGroup,
  endTempEditingAndCommit,
  addTempNodeAt,
  deleteTempNodeByIndex,
  moveTempNode,
  insertTempNodeOnSegment,
  queueStationFromExisting,
  addStationAt,
  addTransferStationAt,
  removeStation,
  moveStationAlongRoute,
  mergeRoutes,
  ungroupRoute,
  setRouteColor,
  setGroupColor,
  setGroupName,
  setStationName,
  setStationLabelPosition,
  refreshSources,
  _store: store,
};
