/**
 * Mapbox layer filter helpers for station hover visuals (edit-station single-station emphasis).
 */

/**
 * Highlight a single station on both circle + label hover layers, or clear when stationId is "".
 */
export function setStationHoverPairFilters(map, stationId) {
  const f = ["==", ["get", "station_id"], stationId];
  if (map.getLayer("stations-circle-hover")) {
    map.setFilter("stations-circle-hover", f);
  }
  if (map.getLayer("stations-label-hover")) {
    map.setFilter("stations-label-hover", f);
  }
}
