import {
  hasLayer,
  setLayerFilter,
  setMapLayoutProperty,
  setMapPaintProperty,
} from "../map-runtime/mapEngine.js";
import { REGULAR_STATION_LAYER_FILTER, TRANSFER_STATION_LAYER_FILTER } from "./layers.js";

/** 基礎圖層預設／hover 樣式（與 layers.js 建立時一致） */
export const STATION_CIRCLE_RADIUS_DEFAULT = 7;
export const STATION_CIRCLE_RADIUS_HOVER = 9.5;
export const TRANSFER_CIRCLE_RADIUS_DEFAULT = 7.2;
export const TRANSFER_CIRCLE_RADIUS_HOVER = 9.25;
export const STATION_LABEL_SIZE_DEFAULT = 14;
export const STATION_LABEL_SIZE_HOVER = 15;
export const STATION_LABEL_HALO_DEFAULT = 0.5;
export const STATION_LABEL_HALO_HOVER = 1.5;

const EMPTY_STATION_FILTER = ["==", ["get", "station_id"], ""];
const EMPTY_ABSORB_ZONE_FILTER = ["==", ["get", "snap_id"], ""];

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

export function hideStationHoverOverlayLayers(map, { preserveRouteHoverLabels = false } = {}) {
  setLayerFilter(map, "stations-circle-hover", ["all", REGULAR_STATION_LAYER_FILTER, EMPTY_STATION_FILTER]);
  setLayerFilter(map, "transfer-stations-circle-hover", [
    "all",
    TRANSFER_STATION_LAYER_FILTER,
    EMPTY_STATION_FILTER,
  ]);
  if (!preserveRouteHoverLabels) {
    setLayerFilter(map, "stations-label-hover", EMPTY_STATION_FILTER);
  }
}

/**
 * 路線／單站 hover：只改基礎圖層 paint，不切換 hover 疊層，避免站名／站點閃爍。
 * @param {import("../map-runtime/mapTypes.js").MapLike | null | undefined} map
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

  if (hasLayer(map, "stations-circle")) {
    setMapPaintProperty(map, "stations-circle", "circle-radius", regularRadius);
  }
  if (hasLayer(map, "transfer-stations-circle")) {
    setMapPaintProperty(map, "transfer-stations-circle", "circle-radius", transferRadius);
  }
  if (hasLayer(map, "stations-label")) {
    setMapLayoutProperty(map, "stations-label", "text-size", labelSize);
    setMapPaintProperty(map, "stations-label", "text-halo-width", labelHalo);
    setMapPaintProperty(map, "stations-label", "text-opacity", 1);
  }

  hideStationHoverOverlayLayers(map, { preserveRouteHoverLabels: ids.length > 0 });
}

export function clearStationHoverVisuals(map) {
  lastHoverVisualKey = null;
  applyStationHoverVisuals(map, {});
}

export function setTransferAbsorbZoneHoverFilter(map, snapId) {
  if (!map) return;
  const sid = typeof snapId === "string" ? snapId : "";
  const filter = sid ? ["==", ["get", "snap_id"], sid] : EMPTY_ABSORB_ZONE_FILTER;
  setLayerFilter(map, "transfer-absorb-zones-hover-layer", filter);
  setLayerFilter(map, "transfer-absorb-zones-hover-outline-layer", filter);
}

export function clearTransferAbsorbZoneHoverFilter(map) {
  setTransferAbsorbZoneHoverFilter(map, "");
}

/** 編輯模式：單一站點強調（與路線 hover 共用基礎圖層樣式）。 */
export function setStationHoverPairFilters(map, stationId) {
  applyStationHoverVisuals(map, { stationId: stationId || "" });
}

/** @deprecated 改由 applyStationHoverVisuals 統一處理，保留介面避免舊呼叫 */
export function setStationLabelBaseMask(map, _hoverFilter) {
  if (!map || !hasLayer(map, "stations-label")) return;
  setMapPaintProperty(map, "stations-label", "text-opacity", 1);
}
