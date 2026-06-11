/**
 * Transfer snap point index (yellow hover targets for add-transfer mode).
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

const TRANSFER_DEDUP_METERS = 4;
const TRANSFER_ABSORB_METERS = 10;

/** 游標與黃色吸附點距離 ≤ 此值（公尺）時視為「吸附」。 */
export const TRANSFER_SNAP_HOVER_METERS = 22;
/** 點擊路線時，與交叉吸附點距離 ≤ 此值（公尺）則改為新增轉乘站。 */
export const TRANSFER_SNAP_CLICK_METERS = 30;

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
  map.getSource("transfer-snaps").setData(buildTransferSnapPointsFC());
}
