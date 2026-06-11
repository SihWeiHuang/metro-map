import * as T from "@turf/turf";
import { store } from "./metroStore.js";
import { ROUTE_KIND_USER } from "./routeConstants.js";
import { MAX_USER_ROUTES } from "../../shared/shareLimits.js";
import { routeKindOf } from "../metro/routeStoreMutations.js";

export { routeKindOf };

export function isUserRouteFeature(feature) {
  return routeKindOf(feature) === ROUTE_KIND_USER;
}

export function getSubrouteFeatures() {
  return store.subroutesFC.features;
}

export function getStationFeatures() {
  return store.stationsFC.features;
}

export function findSubrouteBySubrouteId(subrouteId) {
  return store.subroutesFC.features.find((f) => f.properties?.subroute_id === subrouteId) ?? null;
}

export function findStationById(stationId) {
  return store.stationsFC.features.find((f) => f.properties?.station_id === stationId) ?? null;
}

export function getEditingSessions() {
  return store.temp.editingSessions || [];
}

export function getPrimaryEditingSession() {
  const sessions = getEditingSessions();
  return sessions[0] ?? null;
}

/** Stations within radiusMeters of coord (bbox pre-filter for performance). */
export function findStationsNearCoord(coord, radiusMeters = 10) {
  if (!coord) return [];
  const [lng, lat] = coord;
  const roughDeg = 0.00012;
  const anchor = T.point(coord);
  const results = [];
  for (const feature of store.stationsFC.features) {
    const c = feature.geometry?.coordinates;
    if (!c) continue;
    if (Math.abs(c[0] - lng) > roughDeg || Math.abs(c[1] - lat) > roughDeg) continue;
    if (T.distance(T.point(c), anchor, { units: "meters" }) <= radiusMeters) {
      results.push(feature);
    }
  }
  return results;
}

export function countUserRoutes() {
  const ids = new Set();
  for (const f of store.subroutesFC.features) {
    if (!isUserRouteFeature(f)) continue;
    const routeId = f.properties?.route_id;
    if (typeof routeId === "string") ids.add(routeId);
  }
  return ids.size;
}

/**
 * @param {number} [additionalRoutes]
 * @returns {{ ok: true } | { ok: false, code: "route_limit_reached", limit: number, current: number }}
 */
export function assertCanAddUserRoutes(additionalRoutes = 1) {
  const current = countUserRoutes();
  const limit = MAX_USER_ROUTES;
  if (current + additionalRoutes > limit) {
    return { ok: false, code: "route_limit_reached", limit, current };
  }
  return { ok: true };
}

export function collectSubrouteIdsForRoute(routeId) {
  return store.subroutesFC.features
    .filter((f) => f.properties?.route_id === routeId)
    .map((f) => f.properties?.subroute_id)
    .filter(Boolean);
}
