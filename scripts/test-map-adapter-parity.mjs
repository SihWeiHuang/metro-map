/**
 * Verify mapboxAdapter and mapLibreAdapter export the same surface.
 * Run: npm run test:map-adapter-parity
 */
import * as mapboxAdapter from "../src/map-runtime/mapboxAdapter.js";
import * as mapLibreAdapter from "../src/map-runtime/mapLibreAdapter.js";

const boxKeys = Object.keys(mapboxAdapter).sort();
const libreKeys = Object.keys(mapLibreAdapter).sort();

const missingInLibre = boxKeys.filter((k) => !libreKeys.includes(k));
const extraInLibre = libreKeys.filter((k) => !boxKeys.includes(k));

if (missingInLibre.length || extraInLibre.length) {
  console.error("map-adapter-parity: export mismatch");
  if (missingInLibre.length) console.error("  missing in mapLibre adapter:", missingInLibre.join(", "));
  if (extraInLibre.length) console.error("  extra in mapLibre adapter:", extraInLibre.join(", "));
  process.exit(1);
}

console.log(`map-adapter-parity: ok (${boxKeys.length} exports)`);
