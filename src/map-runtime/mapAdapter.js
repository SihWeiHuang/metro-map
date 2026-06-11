/**
 * Map engine abstraction — Mapbox implementation today; MapLibre stub mirrors this surface.
 */

/** @typedef {import('./mapTypes.js').MapLike} MapLike */

/**
 * @param {MapLike | null | undefined} map
 * @returns {boolean}
 */
export function isMapReady(map) {
  return Boolean(map?.getSource && map?.getLayer);
}

/**
 * @param {MapLike} map
 * @param {string} layerId
 * @returns {boolean}
 */
export function hasLayer(map, layerId) {
  return Boolean(map.getLayer(layerId));
}

/**
 * @param {MapLike} map
 * @param {string} sourceId
 * @param {object} data
 */
export function setGeoJsonSourceData(map, sourceId, data) {
  const src = map.getSource(sourceId);
  if (src && data && typeof src.setData === "function") src.setData(data);
}

/**
 * @param {MapLike} map
 * @param {string} sourceId
 * @param {object} data
 */
export function addOrUpdateGeoJsonSource(map, sourceId, data) {
  if (map.getSource(sourceId)) {
    setGeoJsonSourceData(map, sourceId, data);
    return;
  }
  map.addSource(sourceId, { type: "geojson", data });
}

/**
 * @param {MapLike} map
 * @param {string} sourceId
 */
export function removeSourceIfExists(map, sourceId) {
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

/**
 * @param {MapLike} map
 * @param {string} layerId
 * @param {unknown} filter
 */
export function setLayerFilter(map, layerId, filter) {
  if (hasLayer(map, layerId)) map.setFilter(layerId, filter);
}

/**
 * @param {MapLike} map
 * @param {string} layerId
 * @returns {unknown}
 */
export function getLayerFilter(map, layerId) {
  if (!hasLayer(map, layerId)) return null;
  return map.getFilter(layerId);
}

/**
 * @param {MapLike} map
 * @param {string} layerId
 */
export function removeLayerIfExists(map, layerId) {
  if (hasLayer(map, layerId)) map.removeLayer(layerId);
}

/**
 * @param {MapLike} map
 * @param {object} layerDef
 * @param {string} [beforeId]
 */
export function addMapLayer(map, layerDef, beforeId) {
  if (beforeId) {
    map.addLayer(layerDef, beforeId);
    return;
  }
  map.addLayer(layerDef);
}

/**
 * @param {MapLike} map
 * @param {string} layerId
 * @param {string} [beforeId]
 */
export function moveMapLayer(map, layerId, beforeId) {
  if (!hasLayer(map, layerId)) return;
  if (beforeId) {
    map.moveLayer(layerId, beforeId);
    return;
  }
  map.moveLayer(layerId);
}

/**
 * @param {MapLike} map
 * @returns {{ layers?: object[], imports?: object[] } | undefined}
 */
export function getMapStyle(map) {
  return map.getStyle?.();
}

/**
 * @param {MapLike} map
 * @returns {boolean}
 */
export function styleUsesMapboxSlots(map) {
  const style = getMapStyle(map);
  if (!style) return false;
  if (Array.isArray(style.imports) && style.imports.length > 0) return true;
  return style.layers?.some((layer) => layer.slot != null) ?? false;
}

/**
 * @param {MapLike} map
 * @param {string} layerId
 * @param {string} name
 * @param {unknown} value
 */
export function setMapLayoutProperty(map, layerId, name, value) {
  if (hasLayer(map, layerId)) map.setLayoutProperty(layerId, name, value);
}

/**
 * @param {MapLike} map
 * @param {string} layerId
 * @param {string} name
 * @param {unknown} value
 */
export function setMapPaintProperty(map, layerId, name, value) {
  if (hasLayer(map, layerId)) map.setPaintProperty(layerId, name, value);
}

/**
 * @param {MapLike} map
 * @param {import('./mapTypes.js').PointLike | [number, number, number, number]} geometry
 * @param {object} [options]
 * @returns {object[]}
 */
export function queryRenderedFeatures(map, geometry, options) {
  return map.queryRenderedFeatures(geometry, options);
}

/**
 * @param {MapLike} map
 * @param {string} type
 * @param {(...args: unknown[]) => void} listener
 */
export function mapOn(map, type, listener) {
  map.on(type, listener);
}

/**
 * @param {MapLike} map
 * @param {string} type
 * @param {(...args: unknown[]) => void} listener
 */
export function mapOff(map, type, listener) {
  map.off(type, listener);
}

/**
 * @param {MapLike} map
 * @param {string} type
 * @param {(...args: unknown[]) => void} listener
 */
export function mapOnce(map, type, listener) {
  map.once(type, listener);
}

/**
 * @param {MapLike} map
 * @param {string} imageId
 * @param {object} imageData
 * @param {object} [options]
 */
export function addMapImage(map, imageId, imageData, options) {
  if (map.hasImage(imageId)) return;
  map.addImage(imageId, imageData, options);
}

/**
 * @param {MapLike} map
 * @param {string} language
 */
export function applyMapLanguage(map, language) {
  if (typeof map.setLanguage === "function") {
    map.setLanguage(language);
    return true;
  }
  return false;
}
