/** Mapbox GL JS adapter — re-export mapAdapter surface for map-runtime consumers. */
export {
  addMapImage,
  addMapLayer,
  addOrUpdateGeoJsonSource,
  applyMapLanguage,
  getLayerFilter,
  getMapStyle,
  hasLayer,
  isMapReady,
  mapOff,
  mapOn,
  mapOnce,
  moveMapLayer,
  queryRenderedFeatures,
  removeLayerIfExists,
  removeSourceIfExists,
  setGeoJsonSourceData,
  setLayerFilter,
  setMapLayoutProperty,
  setMapPaintProperty,
  styleUsesMapboxSlots,
} from "./mapAdapter.js";

/** @typedef {import('./mapTypes.js').MapLike} MapLike */
