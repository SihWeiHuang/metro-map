import { REGULAR_STATION_LAYER_FILTER, TRANSFER_STATION_LAYER_FILTER } from "./layers.js";

/** 基礎圖層預設／hover 樣式（與 layers.js 建立時一致） */
export const STATION_CIRCLE_RADIUS_DEFAULT = 7;
export const STATION_CIRCLE_RADIUS_HOVER = 9.5;
export const TRANSFER_CIRCLE_RADIUS_DEFAULT = 7.2;
export const TRANSFER_CIRCLE_RADIUS_HOVER = 9.25;
export const STATION_LABEL_SIZE_DEFAULT = 12;
export const STATION_LABEL_SIZE_HOVER = 13;
export const STATION_LABEL_HALO_DEFAULT = 1.1;
export const STATION_LABEL_HALO_HOVER = 2.2;

const EMPTY_STATION_FILTER = ["==", ["get", "station_id"], ""];

/** @type {string | null} */
let lastHoverVisualKey = null;

function hoverVisualKey(subrouteIds, stationId) {
  const ids = [...subrouteIds].sort().join("\0");
  return `${stationId}\0${ids}`;
}

/** @param {string[]} subrouteIds */
function buildRouteStationMatchExpr(subrouteIds) {
  if (!subrouteIds.length) return null;
  const transferAny = [
    "any",
    ...subrouteIds.map((rid) => ["in", rid, ["coalesce", ["get", "transfer_routes"], ["literal", []]]]),
  ];
  return ["any", ["in", ["get", "subroute_id"], ["literal", subrouteIds]], transferAny];
}

/**
 * @param {string[]} subrouteIds
 * @param {string} stationId
 * @returns {unknown[] | null}
 */
function buildStationHighlightMatchExpr(subrouteIds, stationId) {
  const parts = [];
  if (stationId) parts.push(["==", ["get", "station_id"], stationId]);
  const routeMatch = buildRouteStationMatchExpr(subrouteIds);
  if (routeMatch) parts.push(routeMatch);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return ["any", ...parts];
}

function caseWhenHighlighted(matchExpr, highlightedValue, defaultValue) {
  if (!matchExpr) return defaultValue;
  return ["case", matchExpr, highlightedValue, defaultValue];
}

function hideStationHoverOverlayLayers(map) {
  if (map.getLayer("stations-circle-hover")) {
    map.setFilter("stations-circle-hover", ["all", REGULAR_STATION_LAYER_FILTER, EMPTY_STATION_FILTER]);
  }
  if (map.getLayer("transfer-stations-circle-hover")) {
    map.setFilter("transfer-stations-circle-hover", ["all", TRANSFER_STATION_LAYER_FILTER, EMPTY_STATION_FILTER]);
  }
  if (map.getLayer("stations-label-hover")) {
    map.setFilter("stations-label-hover", EMPTY_STATION_FILTER);
  }
}

/**
 * 路線／單站 hover：只改基礎圖層 paint，不切換 hover 疊層，避免站名／站點閃爍。
 * @param {import("mapbox-gl").Map | null | undefined} map
 * @param {{ subrouteIds?: string[], stationId?: string }} [options]
 */
export function applyStationHoverVisuals(map, { subrouteIds = [], stationId = "" } = {}) {
  if (!map) return;

  const ids = subrouteIds.filter((id) => typeof id === "string" && id !== "");
  const sid = typeof stationId === "string" ? stationId : "";
  const key = hoverVisualKey(ids, sid);
  if (key === lastHoverVisualKey) return;
  lastHoverVisualKey = key;

  const matchExpr = buildStationHighlightMatchExpr(ids, sid);

  const regularRadius = caseWhenHighlighted(
    matchExpr,
    STATION_CIRCLE_RADIUS_HOVER,
    STATION_CIRCLE_RADIUS_DEFAULT,
  );
  const transferRadius = caseWhenHighlighted(
    matchExpr,
    TRANSFER_CIRCLE_RADIUS_HOVER,
    TRANSFER_CIRCLE_RADIUS_DEFAULT,
  );
  const labelSize = caseWhenHighlighted(matchExpr, STATION_LABEL_SIZE_HOVER, STATION_LABEL_SIZE_DEFAULT);
  const labelHalo = caseWhenHighlighted(matchExpr, STATION_LABEL_HALO_HOVER, STATION_LABEL_HALO_DEFAULT);

  if (map.getLayer("stations-circle")) {
    map.setPaintProperty("stations-circle", "circle-radius", regularRadius);
  }
  if (map.getLayer("transfer-stations-circle")) {
    map.setPaintProperty("transfer-stations-circle", "circle-radius", transferRadius);
  }
  if (map.getLayer("stations-label")) {
    map.setLayoutProperty("stations-label", "text-size", labelSize);
    map.setPaintProperty("stations-label", "text-halo-width", labelHalo);
    map.setPaintProperty("stations-label", "text-opacity", 1);
  }

  hideStationHoverOverlayLayers(map);
}

export function clearStationHoverVisuals(map) {
  lastHoverVisualKey = null;
  applyStationHoverVisuals(map, {});
}

/** 編輯模式：單一站點強調（與路線 hover 共用基礎圖層樣式）。 */
export function setStationHoverPairFilters(map, stationId) {
  applyStationHoverVisuals(map, { stationId: stationId || "" });
}

/** @deprecated 改由 applyStationHoverVisuals 統一處理，保留介面避免舊呼叫 */
export function setStationLabelBaseMask(map, _hoverFilter) {
  if (!map?.getLayer("stations-label")) return;
  map.setPaintProperty("stations-label", "text-opacity", 1);
}
