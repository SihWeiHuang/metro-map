/**
 * CPU baseline for Metro Multiverse hot paths (Node, no Mapbox).
 * Run: npm run test:perf-baseline
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";
import {
  buildStationDisplayCollections,
  featureCollectionWithSmoothedLineStrings,
  smoothLineStringForDisplay,
} from "../src/map/displayLineSmoothing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEFAULT_DATA_DIR = path.join(ROOT, "default-data");

function loadDefaultData() {
  const files = fs
    .readdirSync(DEFAULT_DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const subroutes = [];
  const stations = [];
  for (const name of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(DEFAULT_DATA_DIR, name), "utf8"));
    const sr =
      raw.userSubroutesFC?.features ?? raw.subroutesFC?.features ?? [];
    const st =
      raw.userStationsFC?.features ?? raw.stationsFC?.features ?? [];
    subroutes.push(...sr);
    stations.push(...st);
  }
  return {
    subroutesFC: { type: "FeatureCollection", features: subroutes },
    stationsFC: { type: "FeatureCollection", features: stations },
    fileNames: files,
  };
}

function bench(label, fn, iterations = 5) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const min = times[0];
  const max = times[times.length - 1];
  return { label, medianMs: median, minMs: min, maxMs: max, iterations };
}

function buildTransferSnapPointsFC(subroutesFC) {
  const features = [];
  const seen = [];
  const TRANSFER_DEDUP_METERS = 4;
  const TRANSFER_ABSORB_METERS = 10;
  const routes = subroutesFC.features.filter(
    (f) => f.geometry?.type === "LineString" && f.geometry.coordinates.length >= 2,
  );

  const addSnapFeature = (coord, routeA, routeB, prefix) => {
    const isDup = seen.some(
      (prev) => turf.distance(turf.point(prev), turf.point(coord), { units: "meters" }) < TRANSFER_DEDUP_METERS,
    );
    if (isDup) return;
    seen.push(coord);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coord },
      properties: {
        snap_id: `${prefix}_${routeA.properties.subroute_id}_${routeB.properties.subroute_id}_${features.length}`,
      },
    });
  };

  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i];
      const b = routes[j];
      const lineA = turf.lineString(smoothLineStringForDisplay(a.geometry.coordinates));
      const lineB = turf.lineString(smoothLineStringForDisplay(b.geometry.coordinates));
      turf.lineIntersect(lineA, lineB).features.forEach((pt) => {
        addSnapFeature(pt.geometry.coordinates, a, b, "x");
      });
      const endpoints = [
        { route: a, other: b, coord: a.geometry.coordinates[0] },
        { route: a, other: b, coord: a.geometry.coordinates[a.geometry.coordinates.length - 1] },
        { route: b, other: a, coord: b.geometry.coordinates[0] },
        { route: b, other: a, coord: b.geometry.coordinates[b.geometry.coordinates.length - 1] },
      ];
      endpoints.forEach(({ route, other, coord }) => {
        const otherLine = route === a ? lineB : lineA;
        const snapped = turf.nearestPointOnLine(otherLine, coord, { units: "meters" });
        if ((snapped.properties?.dist ?? Infinity) <= TRANSFER_ABSORB_METERS) {
          addSnapFeature(coord, route, other, "e");
        }
      });
    }
  }
  return { type: "FeatureCollection", features };
}

function buildPersistPayload(store) {
  const userSubroutes = store.subroutesFC.features.filter((f) => f.properties?.route_kind !== "default");
  const userSubrouteIds = new Set(userSubroutes.map((f) => f.properties?.subroute_id));
  const userStations = store.stationsFC.features.filter((f) =>
    userSubrouteIds.has(f.properties?.subroute_id),
  );
  return {
    v: 2,
    userSubroutesFC: { type: "FeatureCollection", features: userSubroutes },
    userStationsFC: { type: "FeatureCollection", features: userStations },
    hiddenSubrouteIds: [],
    removedDefaultRouteIds: [],
    builtinDefaultsSuppressed: false,
    counters: { subroute: 1, route: 1, station: 1 },
    settings: { stationMinPerRoute: 0 },
  };
}

function measureBundleSize() {
  const dist = path.join(ROOT, "dist");
  if (!fs.existsSync(dist)) return null;
  const assets = path.join(dist, "assets");
  if (!fs.existsSync(assets)) return null;
  let total = 0;
  /** @type {{ name: string, bytes: number }[]} */
  const files = [];
  for (const name of fs.readdirSync(assets)) {
    const p = path.join(assets, name);
    const stat = fs.statSync(p);
    if (stat.isFile()) {
      total += stat.size;
      files.push({ name, bytes: stat.size });
    }
  }
  files.sort((a, b) => b.bytes - a.bytes);
  return { totalBytes: total, topFiles: files.slice(0, 5) };
}

const data = loadDefaultData();
const { subroutesFC, stationsFC, fileNames } = data;
const routeCount = subroutesFC.features.length;
const stationCount = stationsFC.features.length;
const pairCount = (routeCount * (routeCount - 1)) / 2;

console.log("Metro Multiverse — Performance Baseline");
console.log("=====================================");
console.log(`default-data files: ${fileNames.join(", ")}`);
console.log(`routes (subroutes): ${routeCount}`);
console.log(`stations: ${stationCount}`);
console.log(`transfer snap pairs: ${pairCount}`);
console.log("");

const results = [];

results.push(
  bench("refreshSources.smoothRoutes", () => {
    featureCollectionWithSmoothedLineStrings(subroutesFC);
  }),
);

results.push(
  bench("refreshSources.stationSnap", () => {
    buildStationDisplayCollections(stationsFC, subroutesFC);
  }),
);

results.push(
  bench("refreshSources.fullPipeline", () => {
    featureCollectionWithSmoothedLineStrings(subroutesFC);
    buildStationDisplayCollections(stationsFC, subroutesFC);
  }),
);

results.push(
  bench("editStation.transferSnapBuild", () => {
    buildTransferSnapPointsFC(subroutesFC);
  }),
);

const persistPayload = buildPersistPayload({ subroutesFC, stationsFC });
results.push(
  bench("persist.JSON.stringify", () => {
    JSON.stringify(persistPayload);
  }),
);

console.log("| Metric | Median (ms) | Min | Max |");
console.log("|--------|-------------|-----|-----|");
for (const r of results) {
  console.log(
    `| ${r.label} | ${r.medianMs.toFixed(2)} | ${r.minMs.toFixed(2)} | ${r.maxMs.toFixed(2)} |`,
  );
}

const payloadBytes = Buffer.byteLength(JSON.stringify(persistPayload), "utf8");
console.log("");
console.log(`persist payload size (user-only, no local edits): ${(payloadBytes / 1024).toFixed(1)} KB`);

const bundle = measureBundleSize();
if (bundle) {
  console.log(`production bundle (dist/assets total): ${(bundle.totalBytes / 1024 / 1024).toFixed(2)} MB`);
  for (const f of bundle.topFiles) {
    console.log(`  - ${f.name}: ${(f.bytes / 1024).toFixed(0)} KB`);
  }
} else {
  console.log("production bundle: run `npm run build` first for dist size metrics");
}

console.log("");
console.log("Browser-only metrics (manual): station drag mousemove fps, locale switch wall time.");
console.log("See docs/PERFORMANCE_BASELINE.md for targets after Phase 2.");
