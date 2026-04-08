/**
 * Mapbox layer filter helpers for station/route hover visuals.
 * Keeps filter expressions in one place (behavior must match prior inline setFilter calls).
 */

/** Clear routes-line-hover to show no highlighted route line (matches existing empty filter). */
export function clearRoutesLineHoverFilter(map) {
  if (map.getLayer("routes-line-hover")) {
    map.setFilter("routes-line-hover", ["==", ["get", "route_id"], ""]);
  }
}

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
