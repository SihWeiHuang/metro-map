import { REGULAR_STATION_LAYER_FILTER, TRANSFER_STATION_LAYER_FILTER } from "./layers.js";

/**
 * Mapbox layer filter helpers for station hover visuals (edit-station single-station emphasis).
 */

/**
 * Highlight a single station on both circle + label hover layers, or clear when stationId is "".
 */
export function setStationHoverPairFilters(map, stationId) {
  if (!map) return;
  const f = ["==", ["get", "station_id"], stationId];
  if (map.getLayer("stations-circle-hover")) {
    map.setFilter("stations-circle-hover", ["all", REGULAR_STATION_LAYER_FILTER, f]);
  }
  if (map.getLayer("transfer-stations-circle-hover")) {
    map.setFilter("transfer-stations-circle-hover", ["all", TRANSFER_STATION_LAYER_FILTER, f]);
  }
  if (map.getLayer("stations-label-hover")) {
    map.setFilter("stations-label-hover", f);
  }
  setStationLabelBaseMask(map, stationId ? f : null);
}

export function setStationLabelBaseMask(map, hoverFilter) {
  if (!map?.getLayer("stations-label")) return;
  map.setPaintProperty("stations-label", "text-opacity", hoverFilter ? ["case", hoverFilter, 0, 1] : 1);
}
