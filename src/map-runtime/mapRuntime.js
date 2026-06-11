/**
 * Map engine runtime facade — MapView / popups import from here only.
 * Selects Mapbox (default) or MapLibre stub via VITE_MAP_ENGINE at build time.
 */
import * as mapboxRt from "./mapboxRuntime.js";
import * as maplibreRt from "./maplibreRuntime.js";
import { activeMapEngine } from "./mapEngineConfig.js";

const rt = activeMapEngine === "maplibre" ? maplibreRt : mapboxRt;

export { activeMapEngine };

export const setMapAccessToken = rt.setMapAccessToken;
export const createMap = rt.createMap;
export const createNavigationControl = rt.createNavigationControl;
export const createMapPopup = rt.createMapPopup;
export const getDefaultMapStyle = rt.getDefaultMapStyle;
