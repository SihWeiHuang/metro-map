/**
 * Route CRUD, editing sessions, stations, merge/split, metadata.
 */
import * as T from "@turf/turf";
import { t } from "../i18n/i18n.js";
import { store } from "../data/metroStore.js";
import {
  ROUTE_KIND_DEFAULT,
  ROUTE_KIND_USER,
  ROUTE_STATUS_CONSTRUCTION,
  ROUTE_STATUS_CUSTOM,
  ROUTE_STATUS_OPERATING,
  ROUTE_STATUS_PLANNING,
} from "../data/routeConstants.js";
import { getStoreRevision, notifyStoreChanged } from "./domainNotifier.js";
import { flushPersistToStorage, schedulePersistToStorage } from "./persistenceAdapter.js";
import { clearHover } from "./routeHoverCommands.js";
import {
  applyHiddenSubrouteVisibility,
  refreshSources,
  refreshSourcesWithDirty,
  refreshStationDisplaySources,
  refreshTempEditSources,
} from "./routeRenderCommands.js";
import { assertCanAddUserRoutes } from "../data/routeQueries.js";
import {
  STATION_NAME_MAX_LEN,
  bumpRoutesGeometryRevision,
  clampName15,
  isUserRouteFeature,
  isUserStationFeature,
  nextRouteId,
  nextStationId,
  nextSubrouteId,
  normalizeStatus,
  normalizeUserDefaultNames,
  routeKindOf,
  syncCountersFromLoadedFeatures,
  syncRouteSubrouteMetadata,
  trackRemovedDefaultRoutes,
  updateBuiltinDefaultsSuppression,
} from "./routeStoreMutations.js";
import {
  nearestPointOnSmoothedRoute,
  nearestPointOnSmoothedRouteForVertexInsert,
} from "../map/displayLineSmoothing.js";
import { getBundledDefaultRouteOrder } from "../data/defaultDataLoader.js";
import {
  allocateDefaultRouteLabel,
  allocateDefaultStationLabel,
  resolveRouteDisplayName,
  resolveRouteDisplayNameFromProps,
  resolveStationDisplayName,
  shouldClearRouteLabelOnRename,
  shouldClearStationLabelOnRename,
} from "../map/defaultNames.js";
import {
  buildCityOptions,
  buildCountryOptions,
  canonicalizeCountryId,
  canonicalizeRegion,
  collectGeoPairsFromRoutes,
  formatGeoPatch,
  getCatalogMapView,
  getCountryLabelKey,
  normalizeGeoMetadataPatch,
} from "../map/geoCatalog.js";
import { resolveRouteListNavGeoForNewRoute } from "../map/routeListNavPrefs.js";
import { getMap } from "../map/mapInstance.js";
import { projectMapPoint, unprojectMapPoint } from "../map-runtime/mapEngine.js";
import { relocateTransferStationsForEditedSubroutes } from "../map/routeTransferGeometry.js";
import { refreshTransferSnapSource } from "../map/routeTransferSnap.js";
import { refreshAbsorbZonesSource } from "../map/transferAbsorbZones.js";
import { TRANSFER_ABSORB_METERS } from "../map/transferAbsorbConfig.js";

const ROUTE_STATUS_VALUES = new Set([
  ROUTE_STATUS_OPERATING,
  ROUTE_STATUS_PLANNING,
  ROUTE_STATUS_CONSTRUCTION,
  ROUTE_STATUS_CUSTOM,
]);

/** 視為同一重疊點的車站距離（公尺）。 */
const STATION_COINCIDENT_METERS = 2;

function userRouteListSortKey(routeId) {
  const feature = store.subroutesFC.features.find((f) => f.properties?.route_id === routeId);
  const label = feature?.properties?.user_default_route_label;
  if (typeof label === "number" && Number.isFinite(label)) return label;
  const m = String(routeId).match(/^g(\d+)$/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

/** 使用者路線在上（依建立標號）；預設路線在下（依 default-data 順序）。 */
function compareRouteListEntries(a, b) {
  const aIsUser = a.route_kind === ROUTE_KIND_USER;
  const bIsUser = b.route_kind === ROUTE_KIND_USER;
  if (aIsUser !== bIsUser) return aIsUser ? -1 : 1;

  if (aIsUser) {
    return userRouteListSortKey(a.route_id) - userRouteListSortKey(b.route_id);
  }

  const defaultOrder = getBundledDefaultRouteOrder();
  const aIdx = defaultOrder.get(a.route_id) ?? Number.MAX_SAFE_INTEGER;
  const bIdx = defaultOrder.get(b.route_id) ?? Number.MAX_SAFE_INTEGER;
  if (aIdx !== bIdx) return aIdx - bIdx;
  return String(a.route_id).localeCompare(String(b.route_id));
}

let routeListCache = null;
let routeListCacheRevision = -1;

function buildRouteList() {
  const routes = {};
  store.subroutesFC.features.forEach((f) => {
    const p = f.properties;
    const rk =
      p.route_kind === ROUTE_KIND_DEFAULT || p.route_kind === ROUTE_KIND_USER ? p.route_kind : ROUTE_KIND_USER;
    const country = canonicalizeCountryId(p.country);
    const region = canonicalizeRegion(p.region);
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
  const list = Object.entries(routes).map(([route_id, subroutes]) => {
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
  list.sort(compareRouteListEntries);
  return list;
}

export function getRouteList() {
  const revision = getStoreRevision();
  if (routeListCache && routeListCacheRevision === revision) return routeListCache;
  routeListCache = buildRouteList();
  routeListCacheRevision = revision;
  return routeListCache;
}

export function getActiveEditRouteId() {
  if (!Array.isArray(store.temp.editingSessions) || store.temp.editingSessions.length === 0) return null;
  for (const session of store.temp.editingSessions) {
    if (!session?.subrouteId) continue;
    const route = store.subroutesFC.features.find((f) => f.properties?.subroute_id === session.subrouteId);
    if (route?.properties?.route_id) return route.properties.route_id;
  }
  return null;
}

export function deleteSubroute(subroute_id) {
  store.subroutesFC.features = store.subroutesFC.features.filter((f) => f.properties.subroute_id !== subroute_id);
  store.stationsFC.features = store.stationsFC.features.filter((f) => f.properties.subroute_id !== subroute_id);
  store.hiddenSubrouteIds.delete(subroute_id);
  syncCountersFromLoadedFeatures();
  bumpRoutesGeometryRevision();
  refreshSources();
}

export function deleteRoute(routeId) {
  const subrouteIdsInRoute = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId).map((f) => f.properties.subroute_id);

  if (subrouteIdsInRoute.length === 0) return;

  trackRemovedDefaultRoutes(routeId);

  store.subroutesFC.features = store.subroutesFC.features.filter((f) => f.properties.route_id !== routeId);
  store.stationsFC.features = store.stationsFC.features.filter((f) => !subrouteIdsInRoute.includes(f.properties.subroute_id));
  subrouteIdsInRoute.forEach((rid) => store.hiddenSubrouteIds.delete(rid));
  syncCountersFromLoadedFeatures();
  updateBuiltinDefaultsSuppression();
  bumpRoutesGeometryRevision();
  refreshSources();
  flushPersistToStorage();
}

export function deleteRoutes(routeIds) {
  if (!Array.isArray(routeIds) || routeIds.length === 0) return;
  const idSet = new Set(routeIds);
  const subrouteIdsToDelete = store.subroutesFC.features
    .filter((f) => idSet.has(f.properties.route_id))
    .map((f) => f.properties.subroute_id);
  if (!subrouteIdsToDelete.length) return;

  trackRemovedDefaultRoutes(routeIds);

  store.subroutesFC.features = store.subroutesFC.features.filter((f) => !idSet.has(f.properties.route_id));
  store.stationsFC.features = store.stationsFC.features.filter((f) => !subrouteIdsToDelete.includes(f.properties.subroute_id));
  subrouteIdsToDelete.forEach((rid) => store.hiddenSubrouteIds.delete(rid));
  syncCountersFromLoadedFeatures();
  updateBuiltinDefaultsSuppression();
  bumpRoutesGeometryRevision();
  refreshSources();
  flushPersistToStorage();
}

export function setRoutesHidden(routeIds, hidden) {
  if (!Array.isArray(routeIds) || routeIds.length === 0) return false;
  const routeIdSet = new Set(routeIds);
  let changed = false;
  for (const f of store.subroutesFC.features) {
    const routeId = f.properties?.route_id;
    const subrouteId = f.properties?.subroute_id;
    if (!routeIdSet.has(routeId) || typeof subrouteId !== "string") continue;
    if (hidden) {
      if (!store.hiddenSubrouteIds.has(subrouteId)) changed = true;
      store.hiddenSubrouteIds.add(subrouteId);
    } else if (store.hiddenSubrouteIds.has(subrouteId)) {
      changed = true;
      store.hiddenSubrouteIds.delete(subrouteId);
    }
  }
  if (!changed) return false;
  applyHiddenSubrouteVisibility();
  schedulePersistToStorage();
  notifyStoreChanged();
  if (hidden) clearHover();
  return true;
}

export function setRouteHidden(routeId, hidden) {
  setRoutesHidden([routeId], hidden);
}

export function isRouteHidden(routeId) {
  const subrouteIds = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId).map((f) => f.properties.subroute_id);
  if (!subrouteIds.length) return false;
  return subrouteIds.every((rid) => store.hiddenSubrouteIds.has(rid));
}

export function clearEditSessionHiddenSubroutes() {
  for (const rid of store.temp.editSessionAddedHidden) {
    store.hiddenSubrouteIds.delete(rid);
  }
  store.temp.editSessionAddedHidden.clear();
  store.temp.editHiddenSubrouteIds.clear();
}

export function hideSubrouteForEditSession(subrouteId) {
  store.temp.editHiddenSubrouteIds.add(subrouteId);
  if (store.hiddenSubrouteIds.has(subrouteId)) return;
  store.temp.editSessionAddedHidden.add(subrouteId);
  store.hiddenSubrouteIds.add(subrouteId);
}

export function startNewTempRoute() {
  clearEditSessionHiddenSubroutes();
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  store.temp.editingSessions = [{ subrouteId: null, nodes: [] }];
  refreshTempEditSources();
}

export function startEditRoute(routeId) {
  const subroutesInRoute = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId);
  if (!subroutesInRoute.length) return;
  clearEditSessionHiddenSubroutes();
  store.temp.editingSessions = [];
  store.temp.queuedStations = [];
  subroutesInRoute.forEach((route) => {
    store.temp.editingSessions.push({
      subrouteId: route.properties.subroute_id,
      nodes: route.geometry.coordinates.slice(),
    });
    hideSubrouteForEditSession(route.properties.subroute_id);
  });
  refreshSources();
}

export function endTempEditingAndCommit() {
  if (!store.temp.editingSessions || store.temp.editingSessions.length === 0) {
    return { ok: true, newRouteIds: [] };
  }

  const newSubrouteIdMap = new Map();
  const newRouteIds = [];
  const editedSubrouteIds = new Set();
  const transferStationIdsToNormalize = new Set();
  const newRouteNavGeo = resolveRouteListNavGeoForNewRoute(getRouteList());

  store.temp.editingSessions.forEach((session) => {
    const { subrouteId, nodes } = session;
    if (nodes.length < 2) return;

    if (subrouteId) {
      const routeFeature = store.subroutesFC.features.find((x) => x.properties.subroute_id === subrouteId);
      if (!routeFeature) return;
      routeFeature.geometry.coordinates = nodes;
      editedSubrouteIds.add(subrouteId);
      store.stationsFC.features.forEach((station) => {
        if (station.properties.subroute_id === subrouteId) {
          const snapped = nearestPointOnSmoothedRoute(nodes, station.geometry.coordinates);
          if (snapped?.geometry?.coordinates) {
            station.geometry.coordinates = snapped.geometry.coordinates;
          }
        }
      });
    } else {
      const routeLimit = assertCanAddUserRoutes(1);
      if (!routeLimit.ok) {
        return routeLimit;
      }
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
          country: newRouteNavGeo?.country ?? "",
          region: newRouteNavGeo?.region ?? "",
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
          const snapped = nearestPointOnSmoothedRoute(session.nodes, st.geometry.coordinates);
          if (snapped && snapped.properties.dist < minDistance) {
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
      transferStationIdsToNormalize.add(st.properties.station_id);
    });
  }

  clearEditSessionHiddenSubroutes();
  store.temp.editingSessions = [];
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  relocateTransferStationsForEditedSubroutes(editedSubrouteIds).forEach((stationId) =>
    transferStationIdsToNormalize.add(stationId)
  );
  normalizeTransferStations(transferStationIdsToNormalize);
  syncCountersFromLoadedFeatures();
  bumpRoutesGeometryRevision();
  refreshSources();
  return { ok: true, newRouteIds };
}

export function cancelTempEditing() {
  const previewIds = new Set(store.temp.previewStations || []);
  const stationsBefore = store.stationsFC.features.length;
  store.stationsFC.features = store.stationsFC.features.filter((s) => {
    const sid = s.properties?.station_id;
    if (sid && previewIds.has(sid)) return false;
    if (s.properties?.subroute_id === "__temp_preview__") return false;
    return true;
  });
  const stationsChanged = store.stationsFC.features.length !== stationsBefore;

  clearEditSessionHiddenSubroutes();
  store.temp.editingSessions = [];
  store.temp.previewStations = [];
  store.temp.queuedStations = [];
  store.temp.subrouteIdEditing = null;
  syncCountersFromLoadedFeatures();

  if (stationsChanged) {
    refreshStationDisplaySources();
  }
  refreshTempEditSources();
  applyHiddenSubrouteVisibility();
  return { ok: true };
}

export function getRouteStatus(routeId) {
  const route = store.subroutesFC.features.find((f) => f.properties?.route_id === routeId);
  return normalizeStatus(route?.properties?.status);
}

export function getRouteGeo(routeId) {
  const entry = getRouteList().find((g) => g.route_id === routeId);
  return {
    country: entry?.country ?? "",
    region: entry?.region ?? "",
  };
}

export function setRouteStatus(routeId, status) {
  const next = normalizeStatus(status);
  const routes = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId);
  if (!routes.length) return;
  for (const f of routes) {
    f.properties.status = next;
  }
  refreshSources();
}

export function addTempNodeAt(coord, subrouteId, insertIndex = null) {
  const session = subrouteId
    ? store.temp.editingSessions.find((s) => s.subrouteId === subrouteId)
    : store.temp.editingSessions[0];
  if (!session) return;
  if (insertIndex === null) session.nodes.push(coord);
  else session.nodes.splice(insertIndex, 0, coord);
  refreshTempEditSources();
}

export function deleteTempNodeByIndex(idx, subrouteId) {
  const session = subrouteId
    ? store.temp.editingSessions.find((s) => s.subrouteId === subrouteId)
    : store.temp.editingSessions[0];
  if (!session || idx < 0 || idx >= session.nodes.length) return;
  session.nodes.splice(idx, 1);
  refreshTempEditSources();
}

export function updateTempNodeCoord(idx, coord, subrouteId) {
  const session = subrouteId
    ? store.temp.editingSessions.find((s) => s.subrouteId === subrouteId)
    : store.temp.editingSessions[0];
  if (!session || idx < 0 || idx >= session.nodes.length) return false;
  session.nodes[idx] = coord;
  return true;
}

export function moveTempNode(idx, coord, subrouteId, options = {}) {
  if (!updateTempNodeCoord(idx, coord, subrouteId)) return;
  if (options.preview) refreshTempEditSources();
  else refreshSources();
}

export function insertTempNodeOnSegment(pointPx, subrouteId) {
  const map = getMap();
  const session = subrouteId
    ? store.temp.editingSessions.find((s) => s.subrouteId === subrouteId)
    : store.temp.editingSessions[0];
  if (!map || !session || session.nodes.length < 2) return;
  const lngLat = unprojectMapPoint(map, pointPx);
  const snapped = nearestPointOnSmoothedRouteForVertexInsert(session.nodes, [lngLat.lng, lngLat.lat]);
  if (!snapped?.geometry?.coordinates) return;
  const insertIdx = snapped.properties.index + 1;
  addTempNodeAt(snapped.geometry.coordinates, session.subrouteId, insertIdx);
}

export function addStationAt(subroute_id, coord, name = null, color = null, extraProps = {}, options = {}) {
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
  if (!options.skipRefresh) refreshSources({ full: true });
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

function distanceMeters(coordA, coordB) {
  if (!coordA || !coordB) return Infinity;
  const lngScale = 111320 * Math.cos((((coordA[1] + coordB[1]) / 2) * Math.PI) / 180);
  const dx = (coordA[0] - coordB[0]) * lngScale;
  const dy = (coordA[1] - coordB[1]) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

function stationDisplayCoordForAbsorption(station) {
  const coord = station?.geometry?.coordinates;
  if (!coord || station.properties?.is_transfer_fixed) return coord;

  const subrouteId = station.properties?.subroute_id;
  const route = store.subroutesFC.features.find((f) => f.properties?.subroute_id === subrouteId);
  if (!route?.geometry?.coordinates || route.geometry.coordinates.length < 2) return coord;

  const snapped = nearestPointOnSmoothedRoute(route.geometry.coordinates, coord);
  return snapped?.geometry?.coordinates || coord;
}

function stationTouchesAnySubroute(station, subrouteIds) {
  if (!subrouteIds || subrouteIds.size === 0) return true;
  const subrouteId = station?.properties?.subroute_id;
  if (typeof subrouteId === "string" && subrouteIds.has(subrouteId)) return true;
  const transferRoutes = station?.properties?.transfer_routes;
  return Array.isArray(transferRoutes) && transferRoutes.some((rid) => subrouteIds.has(rid));
}

function stationDistanceToCoordForAbsorption(station, coord, relevantSubrouteIds = null) {
  const rawCoord = station?.geometry?.coordinates;
  if (!rawCoord) return Infinity;

  const rawDistance = distanceMeters(rawCoord, coord);
  if (rawDistance <= TRANSFER_ABSORB_METERS) return rawDistance;
  if (relevantSubrouteIds && !stationTouchesAnySubroute(station, relevantSubrouteIds)) return rawDistance;

  const displayCoord = stationDisplayCoordForAbsorption(station);
  if (!displayCoord) return rawDistance;

  return Math.min(rawDistance, distanceMeters(displayCoord, coord));
}

function stationsCoincidentForAbsorption(a, b) {
  const rawA = a?.geometry?.coordinates;
  const rawB = b?.geometry?.coordinates;
  if (!rawA || !rawB) return false;
  const rawDistance = distanceMeters(rawA, rawB);
  if (rawDistance <= STATION_COINCIDENT_METERS) return true;
  if (rawDistance > TRANSFER_ABSORB_METERS) return false;

  const displayA = stationDisplayCoordForAbsorption(a);
  const displayB = stationDisplayCoordForAbsorption(b);
  return Boolean(displayA && displayB && distanceMeters(displayA, displayB) <= STATION_COINCIDENT_METERS);
}

/** 轉乘點應吸收的一般站（含重疊的 s5/s6、路線頭尾站）。 */
function collectStationIdsToAbsorbForTransfer(coord, mergedSubrouteIds) {
  const toRemove = new Set();
  const subrouteIds = new Set(mergedSubrouteIds);
  const queue = [];
  const visited = new Set();

  const markForAbsorb = (s) => {
    if (!s?.properties?.station_id) return;
    if (s.properties.is_transfer_fixed) return;
    if (toRemove.has(s.properties.station_id)) return;
    toRemove.add(s.properties.station_id);
    expandMergedSubrouteIdsFromStation(s, subrouteIds);
  };

  const markForAbsorbAndExpandCoincident = (s) => {
    const sid = s?.properties?.station_id;
    if (!sid || s.properties?.is_transfer_fixed) return;
    markForAbsorb(s);
    if (visited.has(sid)) return;
    visited.add(sid);
    queue.push(s);
  };

  const expandCoincidentStations = () => {
    while (queue.length > 0) {
      const current = queue.shift();
      for (const s of store.stationsFC.features) {
        if (s.properties?.is_transfer_fixed) continue;
        const sid = s.properties.station_id;
        if (!sid || visited.has(sid)) continue;
        if (stationsCoincidentForAbsorption(s, current)) {
          markForAbsorbAndExpandCoincident(s);
        }
      }
    }
  };

  for (const s of store.stationsFC.features) {
    if (s.properties?.is_transfer_fixed) continue;
    const d = stationDistanceToCoordForAbsorption(s, coord, subrouteIds);
    if (d <= TRANSFER_ABSORB_METERS) {
      markForAbsorbAndExpandCoincident(s);
    }
  }

  // Expand to every regular station coincident with any station at this overlap point.
  expandCoincidentStations();

  for (const subrouteId of subrouteIds) {
    const route = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteId);
    if (!route?.geometry?.coordinates || route.geometry.coordinates.length < 2) continue;
    const coords = route.geometry.coordinates;
    const ends = [coords[0], coords[coords.length - 1]];

    for (const endCoord of ends) {
      const endNearTransfer = distanceMeters(endCoord, coord) <= TRANSFER_ABSORB_METERS;
      if (!endNearTransfer) continue;

      for (const s of store.stationsFC.features) {
        if (s.properties?.subroute_id !== subrouteId) continue;
        const sc = s.geometry.coordinates;
        const dEnd = distanceMeters(sc, endCoord);
        const dTr = stationDistanceToCoordForAbsorption(s, coord, subrouteIds);
        if (dEnd <= TRANSFER_ABSORB_METERS || dTr <= TRANSFER_ABSORB_METERS) {
          markForAbsorbAndExpandCoincident(s);
          expandCoincidentStations();
        }
      }
    }

    for (const s of store.stationsFC.features) {
      if (s.properties?.subroute_id !== subrouteId) continue;
      if (s.properties?.is_transfer_fixed) continue;
      const snapped = nearestPointOnSmoothedRoute(coords, s.geometry.coordinates);
      const dAlong = snapped.properties.dist ?? Infinity;
      const dToTransfer = stationDistanceToCoordForAbsorption(s, coord, subrouteIds);
      const snappedNearTransfer =
        snapped.geometry?.coordinates && distanceMeters(snapped.geometry.coordinates, coord) <= TRANSFER_ABSORB_METERS;
      if (dAlong <= TRANSFER_ABSORB_METERS && (dToTransfer <= TRANSFER_ABSORB_METERS || snappedNearTransfer)) {
        markForAbsorbAndExpandCoincident(s);
        expandCoincidentStations();
      }
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

function normalizeTransferStations(stationIds = null) {
  const stationIdSet = stationIds ? new Set(stationIds) : null;
  if (stationIdSet && stationIdSet.size === 0) return;
  const transfers = store.stationsFC.features.filter((s) => {
    if (!s.properties?.is_transfer_fixed) return false;
    if (!stationIdSet) return true;
    return stationIdSet.has(s.properties?.station_id);
  });
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

export function addTransferStationAt(coord, subrouteIdA, subrouteIdB) {
  const mergedSubrouteIds = new Set([subrouteIdA, subrouteIdB]);
  const nearbyStations = store.stationsFC.features.filter((s) => {
    return stationDistanceToCoordForAbsorption(s, coord, mergedSubrouteIds) <= TRANSFER_ABSORB_METERS;
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
    refreshSources({ full: true });
    return existingTransfer.properties.station_id;
  }

  const stationId = addStationAt(subrouteIdA, coord, null, color, {
    is_transfer_fixed: true,
    transfer_routes: Array.from(finalSubrouteIds),
  }, { skipRefresh: true });
  refreshSources({ full: true });
  return stationId;
}

export function removeStation(station_id) {
  const st = store.stationsFC.features.find((f) => f.properties.station_id === station_id);
  if (!st) return false;
  const wasTransfer = Boolean(st.properties?.is_transfer_fixed);
  const rid = st.properties.subroute_id;
  const minStations = store.settings.stationMinPerRoute;
  if (minStations > 0) {
    const count = store.stationsFC.features.filter((f) => f.properties.subroute_id === rid).length;
    if (count <= minStations) {
      alert(t("routeModel.alertMinStations", { min: minStations }));
      return false;
    }
  }
  store.stationsFC.features = store.stationsFC.features.filter((f) => f.properties.station_id !== station_id);
  syncCountersFromLoadedFeatures();
  refreshSources({ full: true });
  if (wasTransfer && getMap()) {
    refreshTransferSnapSource();
    refreshAbsorbZonesSource();
  }
  return true;
}

export function moveStationAlongRoute(station_id, newCoord) {
  const st = store.stationsFC.features.find((f) => f.properties.station_id === station_id);
  if (!st) return;
  const rid = st.properties.subroute_id;
  const route = store.subroutesFC.features.find((f) => f.properties.subroute_id === rid);
  if (!route) return;
  const snapped = nearestPointOnSmoothedRoute(route.geometry.coordinates, newCoord);
  if (!snapped?.geometry?.coordinates) return;
  st.geometry.coordinates = snapped.geometry.coordinates;
  refreshSourcesWithDirty(rid);
}

export function setStationLabelPosition(station_id, labelCoord) {
  const st = store.stationsFC.features.find((f) => f.properties.station_id === station_id);
  if (!st) return;
  const map = getMap();
  const stationsData = map?.getSource("stations")?._data;
  const stationDisplayFeature = stationsData?.features?.find((f) => f.properties?.station_id === station_id);
  const centerCoord = stationDisplayFeature?.geometry?.coordinates || st.geometry.coordinates;

  if (!map) return;
  const cp = projectMapPoint(map, centerCoord);
  const tp = projectMapPoint(map, labelCoord);

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

export function queueStationFromExisting(coord) {
  if (!store.temp.editingSessions || store.temp.editingSessions.length === 0) return;

  let closestSession = null;
  let minDistance = Infinity;

  store.temp.editingSessions.forEach((session) => {
    if (session.nodes.length < 2) return;
    const snapped = nearestPointOnSmoothedRoute(session.nodes, coord);
    if (snapped && snapped.properties.dist < minDistance) {
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

export function mergeRoutes(subrouteIdA, subrouteIdB) {
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
  bumpRoutesGeometryRevision();
  setRouteColor(targetRouteId, unifiedColor);
  syncCountersFromLoadedFeatures();
  return { ok: true };
}

export function splitLine(subrouteId) {
  const target = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteId);
  if (!target) return { ok: false, msg: t("routeModel.splitLineNotFound") };

  const routeId = target.properties.route_id;
  const subroutesInRoute = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId);
  if (subroutesInRoute.length <= 1) {
    return { ok: false, msg: t("routeModel.splitLineSingle") };
  }

  const additionalRoutes = subroutesInRoute.length - 1;
  const routeLimit = assertCanAddUserRoutes(additionalRoutes);
  if (!routeLimit.ok) {
    return {
      ok: false,
      code: routeLimit.code,
      limit: routeLimit.limit,
      current: routeLimit.current,
    };
  }

  subroutesInRoute.forEach((route) => {
    route.properties.route_id = nextRouteId();
  });
  normalizeUserDefaultNames();
  bumpRoutesGeometryRevision();
  refreshSources();
  return { ok: true };
}

export function setSubrouteColor(subrouteId, color) {
  const routeFeature = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteId);
  if (routeFeature) {
    routeFeature.properties.color = color;
    store.stationsFC.features.forEach((station) => {
      if (station.properties.subroute_id === subrouteId) {
        station.properties.color = color;
      }
    });
    refreshSourcesWithDirty(subrouteId);
  }
}

export function setRouteColor(routeId, color, options = {}) {
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
  if (options.preview) {
    refreshSources({ preview: true });
  } else {
    refreshSourcesWithDirty(subrouteIdsInRoute);
  }
}

export function setRouteName(routeId, newName) {
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

export function setStationName(stationId, newName) {
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

export function setRouteMetadata(routeId, patch) {
  if (!patch || typeof patch !== "object") return;
  const normalized = normalizeGeoMetadataPatch(patch);
  const routes = store.subroutesFC.features.filter((f) => f.properties.route_id === routeId);
  if (!routes.length) return;
  for (const f of routes) {
    if (normalized.route_kind === ROUTE_KIND_DEFAULT || normalized.route_kind === ROUTE_KIND_USER) {
      f.properties.route_kind = normalized.route_kind;
    }
    if (typeof normalized.country === "string") f.properties.country = normalized.country;
    if (typeof normalized.region === "string") f.properties.region = normalized.region;
    if (normalized.status && ROUTE_STATUS_VALUES.has(normalized.status)) f.properties.status = normalized.status;
  }
  refreshSources();
}

export function getRouteGeoCountryOptions() {
  return buildCountryOptions(getRouteList(), { includeOther: true });
}

export function getRouteGeoCityOptions(countryId) {
  return buildCityOptions(countryId, getRouteList(), { includeOther: true });
}
