/**
 * Mapbox GL JS runtime bootstrap — sole module that imports mapbox-gl for map construction.
 * MapView and popups import from here to keep other map code engine-agnostic.
 */
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

/** @typedef {import('./mapTypes.js').MapLike} MapLike */

/**
 * @param {string} token
 */
export function setMapboxAccessToken(token) {
  mapboxgl.accessToken = token;
}

/**
 * @param {object} options mapboxgl.Map constructor options
 * @returns {MapLike}
 */
export function createMapboxMap(options) {
  return new mapboxgl.Map(options);
}

/**
 * @param {object} [options]
 */
export function createNavigationControl(options) {
  return new mapboxgl.NavigationControl(options);
}

/**
 * @param {object} options
 */
export function createMapboxPopup(options) {
  return new mapboxgl.Popup(options);
}
