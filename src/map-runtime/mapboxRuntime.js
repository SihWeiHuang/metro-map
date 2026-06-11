/**
 * Mapbox GL JS runtime bootstrap — sole module that imports mapbox-gl for map construction.
 * MapView and popups import from here to keep other map code engine-agnostic.
 */
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_DEFAULT_STYLE } from "./mapEngineConfig.js";

/** @typedef {import('./mapTypes.js').MapLike} MapLike */

/**
 * @param {string} token
 */
export function setMapAccessToken(token) {
  mapboxgl.accessToken = token;
}

/** @deprecated Use setMapAccessToken */
export const setMapboxAccessToken = setMapAccessToken;

/**
 * @param {object} options mapboxgl.Map constructor options
 * @returns {MapLike}
 */
export function createMap(options) {
  return new mapboxgl.Map(options);
}

/** @deprecated Use createMap */
export const createMapboxMap = createMap;

/**
 * @param {object} [options]
 */
export function createNavigationControl(options) {
  return new mapboxgl.NavigationControl(options);
}

/**
 * @param {object} options
 */
export function createMapPopup(options) {
  return new mapboxgl.Popup(options);
}

/** @deprecated Use createMapPopup */
export const createMapboxPopup = createMapPopup;

export function getDefaultMapStyle() {
  return MAPBOX_DEFAULT_STYLE;
}
