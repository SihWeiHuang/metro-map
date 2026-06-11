/**
 * Map engine abstraction — Mapbox implementation today; MapLibre stub for future migration.
 */

/** @typedef {import('mapbox-gl').Map} MapboxLikeMap */

/**
 * @param {MapboxLikeMap | null | undefined} map
 * @returns {boolean}
 */
export function isMapReady(map) {
  return Boolean(map?.getSource && map?.getLayer);
}

/**
 * @param {MapboxLikeMap} map
 * @param {string} sourceId
 * @param {object} data
 */
export function setGeoJsonSourceData(map, sourceId, data) {
  const src = map.getSource(sourceId);
  if (src && data) src.setData(data);
}

/**
 * @param {MapboxLikeMap} map
 * @param {string} layerId
 * @param {unknown} filter
 */
export function setLayerFilter(map, layerId, filter) {
  if (map.getLayer(layerId)) map.setFilter(layerId, filter);
}

/**
 * @param {MapboxLikeMap} map
 * @param {string} language
 */
export function applyMapLanguage(map, language) {
  if (typeof map.setLanguage === "function") {
    map.setLanguage(language);
    return true;
  }
  return false;
}
