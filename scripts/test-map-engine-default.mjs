/**
 * Default build uses Mapbox engine (mapRuntime + mapEngine).
 * Run: npm run test:map-engine-default
 */
import { activeMapEngine, MAPBOX_DEFAULT_STYLE } from "../src/map-runtime/mapEngineConfig.js";

if (activeMapEngine !== "mapbox") {
  console.error(`map-engine-default: expected activeMapEngine=mapbox, got ${activeMapEngine}`);
  console.error("  Unset VITE_MAP_ENGINE or set VITE_MAP_ENGINE=mapbox for production builds.");
  process.exit(1);
}

if (typeof MAPBOX_DEFAULT_STYLE !== "string" || !MAPBOX_DEFAULT_STYLE.includes("mapbox://styles/")) {
  console.error("map-engine-default: unexpected MAPBOX_DEFAULT_STYLE", MAPBOX_DEFAULT_STYLE);
  process.exit(1);
}

console.log("map-engine-default: ok (mapbox)");
