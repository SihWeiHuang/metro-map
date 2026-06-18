/**
 * Transfer absorb zone polygons (visual + hover targets in crud submode).
 */
import * as T from "@turf/turf";
import { getStoreRevision } from "../metro/domainNotifier.js";
import {
  getGeometryRevision,
  subscribeGeometryRevisionBump,
} from "../metro/geometryRevisionBoundary.js";
import { getMap } from "./mapInstance.js";
import { getTransferSnapPointsFC, isTransferSnapOccupied } from "./routeTransferSnap.js";
import { ABSORB_ZONE_LAYER, TRANSFER_ABSORB_METERS } from "./transferAbsorbConfig.js";

let absorbZonesCacheRevision = -1;
let absorbZonesCacheFC = null;
/** @type {number | null} */
let absorbZonesIdleHandle = null;

export function invalidateAbsorbZonesCache() {
  absorbZonesCacheRevision = -1;
  absorbZonesCacheFC = null;
}

subscribeGeometryRevisionBump(invalidateAbsorbZonesCache);

function absorbZonesCacheKey() {
  return `${getGeometryRevision()}:${getStoreRevision()}`;
}

function buildAbsorbZonesFC() {
  const revision = absorbZonesCacheKey();
  if (absorbZonesCacheFC && absorbZonesCacheRevision === revision) {
    return absorbZonesCacheFC;
  }

  const features = [];
  const snaps = getTransferSnapPointsFC().features || [];
  for (const snap of snaps) {
    if (isTransferSnapOccupied(snap)) continue;
    const coord = snap.geometry?.coordinates;
    if (!coord) continue;
    const circle = T.circle(coord, TRANSFER_ABSORB_METERS / 1000, { steps: 64, units: "kilometers" });
    circle.properties = {
      snap_id: snap.properties?.snap_id ?? "",
      subroute_id_a: snap.properties?.subroute_id_a ?? "",
      subroute_id_b: snap.properties?.subroute_id_b ?? "",
      snap_lng: coord[0],
      snap_lat: coord[1],
    };
    features.push(circle);
  }

  const fc = { type: "FeatureCollection", features };
  absorbZonesCacheRevision = revision;
  absorbZonesCacheFC = fc;
  return fc;
}

export function cancelScheduledAbsorbZonesRefresh() {
  if (absorbZonesIdleHandle == null) return;
  if (typeof cancelIdleCallback === "function") {
    cancelIdleCallback(absorbZonesIdleHandle);
  } else {
    cancelAnimationFrame(absorbZonesIdleHandle);
  }
  absorbZonesIdleHandle = null;
}

export function scheduleRefreshAbsorbZonesSource() {
  cancelScheduledAbsorbZonesRefresh();
  const run = () => {
    absorbZonesIdleHandle = null;
    refreshAbsorbZonesSource();
  };
  if (typeof requestIdleCallback === "function") {
    absorbZonesIdleHandle = requestIdleCallback(run, { timeout: 3000 });
  } else {
    absorbZonesIdleHandle = requestAnimationFrame(() => {
      absorbZonesIdleHandle = requestAnimationFrame(run);
    });
  }
}

export function ensureAbsorbZonesSourceReady() {
  cancelScheduledAbsorbZonesRefresh();
  refreshAbsorbZonesSource();
}

export function refreshAbsorbZonesSource() {
  const map = getMap();
  if (!map?.getSource("transfer-absorb-zones")) return;
  invalidateAbsorbZonesCache();
  map.getSource("transfer-absorb-zones").setData(buildAbsorbZonesFC());
}

export { ABSORB_ZONE_LAYER };
