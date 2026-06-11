/**
 * Active map engine — resolved at build time from VITE_MAP_ENGINE.
 * Default: mapbox (production). maplibre: dev/experiment only until maplibre-gl is wired.
 */
const viteEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

export const activeMapEngine = viteEnv.VITE_MAP_ENGINE === "maplibre" ? "maplibre" : "mapbox";

/** Mapbox Standard style used in production today. */
export const MAPBOX_DEFAULT_STYLE = "mapbox://styles/ethen9798/cmfceirln001n01sl9bqf4axy";

/** Set VITE_MAPLIBRE_STYLE when experimenting with MapLibre (vector style JSON URL). */
export const MAPLIBRE_DEFAULT_STYLE = viteEnv.VITE_MAPLIBRE_STYLE ?? "";
