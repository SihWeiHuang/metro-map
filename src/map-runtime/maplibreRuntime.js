/**
 * MapLibre GL JS runtime — placeholder until maplibre-gl is added as a dependency.
 * Set VITE_MAP_ENGINE=maplibre to exercise this path in dev; production stays on Mapbox.
 */
import { MAPLIBRE_DEFAULT_STYLE } from "./mapEngineConfig.js";

const INACTIVE =
  "MapLibre runtime is not wired yet. Install maplibre-gl, set VITE_MAPLIBRE_STYLE, then implement createMap in maplibreRuntime.js.";

function notActive() {
  throw new Error(INACTIVE);
}

/** @typedef {import('./mapTypes.js').MapLike} MapLike */

export function setMapAccessToken() {
  notActive();
}

/** @deprecated Use setMapAccessToken */
export const setMapboxAccessToken = setMapAccessToken;

export function createMap() {
  notActive();
}

/** @deprecated Use createMap */
export const createMapboxMap = createMap;

export function createNavigationControl() {
  notActive();
}

export function createMapPopup() {
  notActive();
}

/** @deprecated Use createMapPopup */
export const createMapboxPopup = createMapPopup;

export function getDefaultMapStyle() {
  return MAPLIBRE_DEFAULT_STYLE;
}
