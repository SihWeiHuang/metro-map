/**
 * MapLibre GL JS adapter stub — mirrors mapAdapter surface for Phase 6 migration checklist.
 * Not wired at runtime; Mapbox remains the sole engine until VITE_MAP_ENGINE=maplibre.
 */

const INACTIVE = "MapLibre adapter is not active";

function notActive() {
  throw new Error(INACTIVE);
}

export function isMapReady() {
  return false;
}

export function hasLayer() {
  notActive();
}

export function setGeoJsonSourceData() {
  notActive();
}

export function addOrUpdateGeoJsonSource() {
  notActive();
}

export function removeSourceIfExists() {
  notActive();
}

export function setLayerFilter() {
  notActive();
}

export function getLayerFilter() {
  notActive();
}

export function removeLayerIfExists() {
  notActive();
}

export function addMapLayer() {
  notActive();
}

export function moveMapLayer() {
  notActive();
}

export function getMapStyle() {
  notActive();
}

export function styleUsesMapboxSlots() {
  return false;
}

export function setMapLayoutProperty() {
  notActive();
}

export function setMapPaintProperty() {
  notActive();
}

export function queryRenderedFeatures() {
  notActive();
}

export function mapOn() {
  notActive();
}

export function mapOff() {
  notActive();
}

export function mapOnce() {
  notActive();
}

export function addMapImage() {
  notActive();
}

export function applyMapLanguage() {
  return false;
}
