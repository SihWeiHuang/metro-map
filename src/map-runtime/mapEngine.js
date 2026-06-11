/**
 * Public map adapter API — application code imports from here, not mapAdapter.js.
 * Mapbox and MapLibre adapters share mapAdapter.js today; activeMapEngine selects runtime (mapRuntime.js).
 */
export { activeMapEngine } from "./mapEngineConfig.js";
export * from "./mapAdapter.js";
