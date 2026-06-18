/**
 * Transfer snap point index (yellow hover targets for crud submode).
 */
import * as T from "@turf/turf";
import { store } from "../data/metroStore.js";
import {
  getGeometryRevision,
  subscribeGeometryRevisionBump,
} from "../metro/geometryRevisionBoundary.js";
import { smoothLineStringForDisplay } from "./displayLineSmoothing.js";
import { getMap } from "./mapInstance.js";
import { enumerateCandidateRoutePairs } from "./transferSnapIndex.js";
import {
  TRANSFER_ABSORB_METERS,
  TRANSFER_SNAP_CLICK_METERS,
  TRANSFER_SNAP_HOVER_METERS,
} from "./transferAbsorbConfig.js";

export { TRANSFER_SNAP_CLICK_METERS, TRANSFER_SNAP_HOVER_METERS };

const TRANSFER_DEDUP_METERS = 4;

let transferSnapCacheRevision = -1;
let transferSnapCacheFC = null;
/** @type {number | null} */
let transferSnapIdleHandle = null;

function invalidateTransferSnapCache() {
  transferSnapCacheRevision = -1;
  transferSnapCacheFC = null;
}

subscribeGeometryRevisionBump(invalidateTransferSnapCache);

export function isTransferSnapCacheFresh() {
  return Boolean(transferSnapCacheFC && transferSnapCacheRevision === getGeometryRevision());
}

export function cancelScheduledTransferSnapRefresh() {
  if (transferSnapIdleHandle == null) return;
  if (typeof cancelIdleCallback === "function") {
    cancelIdleCallback(transferSnapIdleHandle);
  } else {
    cancelAnimationFrame(transferSnapIdleHandle);
  }
  transferSnapIdleHandle = null;
}

function buildTransferSnapPointsFC() {
  const revision = getGeometryRevision();
  if (transferSnapCacheFC && transferSnapCacheRevision === revision) {
    return transferSnapCacheFC;
  }

  const features = [];
  const seen = [];
  const routes = store.subroutesFC.features.filter(
    (f) => f.geometry?.type === "LineString" && f.geometry.coordinates.length >= 2,
  );
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

  for (const [i, j] of enumerateCandidateRoutePairs(routes)) {
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
  const fc = { type: "FeatureCollection", features };
  transferSnapCacheRevision = revision;
  transferSnapCacheFC = fc;
  return fc;
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

/** 略過已建立轉乘站的候選點。 */
export function findNearestUnoccupiedTransferSnap(lngLat, maxMeters) {
  const fc = buildTransferSnapPointsFC();
  const pt = T.point([lngLat.lng, lngLat.lat]);
  let best = null;
  let bestD = Infinity;
  for (const f of fc.features) {
    if (isTransferSnapOccupied(f)) continue;
    const d = T.distance(pt, T.point(f.geometry.coordinates), { units: "meters" });
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  if (best && bestD <= maxMeters) return { feature: best, distanceMeters: bestD };
  return null;
}

export function getTransferSnapPointsFC() {
  return buildTransferSnapPointsFC();
}

function snapCoversSubroute(snapSubrouteId, station) {
  if (!snapSubrouteId) return false;
  if (station.properties?.subroute_id === snapSubrouteId) return true;
  const routes = station.properties?.transfer_routes;
  return Array.isArray(routes) && routes.includes(snapSubrouteId);
}

/** 候選點中心（點圖徵或吸收圈 properties 皆可）。 */
export function resolveTransferSnapCenter(snapFeature) {
  const lng = Number(snapFeature?.properties?.snap_lng);
  const lat = Number(snapFeature?.properties?.snap_lat);
  if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
  const coord = snapFeature?.geometry?.coordinates;
  if (Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === "number") {
    return coord;
  }
  return null;
}

/** 將點圖徵／吸收圈圖徵解析成可 hover 的候選點資料。 */
export function resolveSnapCandidateForHover(feature) {
  if (!feature) return null;

  let pointFeature = feature;
  let snapId = feature.properties?.snap_id || "";
  let center = resolveTransferSnapCenter(feature);

  if (!center && snapId) {
    const match = getTransferSnapPointsFC().features.find((f) => f.properties?.snap_id === snapId);
    if (match) {
      pointFeature = match;
      center = resolveTransferSnapCenter(match);
      snapId = match.properties?.snap_id || snapId;
    }
  }

  if (!center) {
    const ridA = feature.properties?.subroute_id_a;
    const ridB = feature.properties?.subroute_id_b;
    if (ridA && ridB) {
      const pairMatch = getTransferSnapPointsFC().features.find(
        (f) =>
          !isTransferSnapOccupied(f) &&
          ((f.properties?.subroute_id_a === ridA && f.properties?.subroute_id_b === ridB) ||
            (f.properties?.subroute_id_a === ridB && f.properties?.subroute_id_b === ridA)),
      );
      if (pairMatch) {
        pointFeature = pairMatch;
        center = resolveTransferSnapCenter(pairMatch);
        snapId = pairMatch.properties?.snap_id || "";
      }
    }
  }

  if (!center) return null;
  if (!snapId) snapId = pointFeature.properties?.snap_id || "";
  if (!snapId) return null;

  return { snapId, center, pointFeature };
}

/** 此交叉點是否已建立對應的固定轉乘站（兩條路線皆相符）。 */
export function isTransferSnapOccupied(snapFeature) {
  const c = resolveTransferSnapCenter(snapFeature);
  if (!c) return false;
  const ridA = snapFeature.properties.subroute_id_a;
  const ridB = snapFeature.properties.subroute_id_b;
  return store.stationsFC.features.some((s) => {
    if (!s.properties?.is_transfer_fixed) return false;
    const close =
      T.distance(T.point(s.geometry.coordinates), T.point(c), { units: "meters" }) <= TRANSFER_DEDUP_METERS;
    return close && snapCoversSubroute(ridA, s) && snapCoversSubroute(ridB, s);
  });
}

/** 空閒時重建轉乘吸附點，避免進入編輯車站模式時阻塞主執行緒。 */
export function scheduleRefreshTransferSnapSource() {
  cancelScheduledTransferSnapRefresh();
  const run = () => {
    transferSnapIdleHandle = null;
    refreshTransferSnapSource();
  };
  if (typeof requestIdleCallback === "function") {
    transferSnapIdleHandle = requestIdleCallback(run, { timeout: 3000 });
  } else {
    transferSnapIdleHandle = requestAnimationFrame(() => {
      transferSnapIdleHandle = requestAnimationFrame(run);
    });
  }
}

/** 立即寫入 transfer-snaps（進「新增轉乘站」等需要黃點已就緒時）。 */
export function ensureTransferSnapSourceReady() {
  cancelScheduledTransferSnapRefresh();
  refreshTransferSnapSource();
}

export function refreshTransferSnapSource() {
  const map = getMap();
  if (!map?.getSource("transfer-snaps")) return;
  const fc = buildTransferSnapPointsFC();
  map.getSource("transfer-snaps").setData({
    type: "FeatureCollection",
    features: fc.features.filter((f) => !isTransferSnapOccupied(f)),
  });
}
