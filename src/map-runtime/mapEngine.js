/**
 * Active map engine selector. Default: Mapbox. Set VITE_MAP_ENGINE=maplibre to opt into stub (dev only).
 */
const ENGINE = import.meta.env.VITE_MAP_ENGINE === "maplibre" ? "maplibre" : "mapbox";

export const activeMapEngine = ENGINE;

export * from "./mapboxAdapter.js";
