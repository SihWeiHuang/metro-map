/**
 * Transfer station geometry helpers (relocate after route edit).
 */
import * as T from "@turf/turf";
import { store } from "../data/metroStore.js";
import { smoothLineStringForDisplay } from "./displayLineSmoothing.js";
import { TRANSFER_ABSORB_METERS } from "./transferAbsorbConfig.js";

function distanceMeters(coordA, coordB) {
  if (!coordA || !coordB) return Infinity;
  const lngScale = 111320 * Math.cos((((coordA[1] + coordB[1]) / 2) * Math.PI) / 180);
  const dx = (coordA[0] - coordB[0]) * lngScale;
  const dy = (coordA[1] - coordB[1]) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

function collectTransferSubrouteIds(station) {
  const ids = new Set();
  if (typeof station?.properties?.subroute_id === "string") ids.add(station.properties.subroute_id);
  const transferRoutes = station?.properties?.transfer_routes;
  if (Array.isArray(transferRoutes)) {
    transferRoutes.forEach((rid) => {
      if (typeof rid === "string") ids.add(rid);
    });
  }
  return ids;
}

function transferSnapCandidatesForRoutePair(routeA, routeB) {
  if (!routeA?.geometry?.coordinates?.length || !routeB?.geometry?.coordinates?.length) return [];
  const lineA = T.lineString(smoothLineStringForDisplay(routeA.geometry.coordinates));
  const lineB = T.lineString(smoothLineStringForDisplay(routeB.geometry.coordinates));
  const candidates = T.lineIntersect(lineA, lineB).features.map((pt) => pt.geometry.coordinates);

  const endpoints = [
    { coord: routeA.geometry.coordinates[0], otherLine: lineB },
    { coord: routeA.geometry.coordinates[routeA.geometry.coordinates.length - 1], otherLine: lineB },
    { coord: routeB.geometry.coordinates[0], otherLine: lineA },
    { coord: routeB.geometry.coordinates[routeB.geometry.coordinates.length - 1], otherLine: lineA },
  ];

  endpoints.forEach(({ coord, otherLine }) => {
    const snapped = T.nearestPointOnLine(otherLine, coord, { units: "meters" });
    if ((snapped.properties?.dist ?? Infinity) <= TRANSFER_ABSORB_METERS) {
      candidates.push(coord);
    }
  });

  return candidates;
}

/** @param {Set<string>} editedSubrouteIds */
export function relocateTransferStationsForEditedSubroutes(editedSubrouteIds) {
  const affectedTransferStationIds = new Set();
  if (!editedSubrouteIds.size) return affectedTransferStationIds;

  const stationIdsToDelete = new Set();
  for (const station of store.stationsFC.features) {
    if (!station.properties?.is_transfer_fixed) continue;
    const subrouteIds = Array.from(collectTransferSubrouteIds(station));
    if (!subrouteIds.some((rid) => editedSubrouteIds.has(rid))) continue;
    affectedTransferStationIds.add(station.properties.station_id);

    const routes = subrouteIds
      .map((rid) => store.subroutesFC.features.find((f) => f.properties?.subroute_id === rid))
      .filter((route) => route?.geometry?.type === "LineString" && route.geometry.coordinates.length >= 2);
    if (routes.length < 2) {
      stationIdsToDelete.add(station.properties.station_id);
      continue;
    }

    const candidates = [];
    const allCandidates = [];
    const validSubrouteIds = new Set();
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const routeA = routes[i];
        const routeB = routes[j];
        const pairIncludesEdited =
          editedSubrouteIds.has(routeA.properties.subroute_id) || editedSubrouteIds.has(routeB.properties.subroute_id);
        const pairCandidates = transferSnapCandidatesForRoutePair(routeA, routeB);
        if (!pairCandidates.length) continue;
        validSubrouteIds.add(routeA.properties.subroute_id);
        validSubrouteIds.add(routeB.properties.subroute_id);
        allCandidates.push(...pairCandidates);
        if (pairIncludesEdited) candidates.push(...pairCandidates);
      }
    }
    if (validSubrouteIds.size < 2) {
      stationIdsToDelete.add(station.properties.station_id);
      continue;
    }
    const moveCandidates = candidates.length ? candidates : allCandidates;
    if (!moveCandidates.length) continue;

    const currentCoord = station.geometry.coordinates;
    const nearest = moveCandidates.reduce(
      (best, coord) => {
        const dist = distanceMeters(currentCoord, coord);
        return dist < best.dist ? { coord, dist } : best;
      },
      { coord: null, dist: Infinity },
    );
    if (nearest.coord) {
      station.geometry.coordinates = nearest.coord;
      const validIds = Array.from(validSubrouteIds);
      if (!validSubrouteIds.has(station.properties.subroute_id)) station.properties.subroute_id = validIds[0];
      station.properties.transfer_routes = validIds;
    }
  }
  if (stationIdsToDelete.size) {
    store.stationsFC.features = store.stationsFC.features.filter(
      (station) => !stationIdsToDelete.has(station.properties?.station_id),
    );
    stationIdsToDelete.forEach((stationId) => affectedTransferStationIds.delete(stationId));
  }
  return affectedTransferStationIds;
}
