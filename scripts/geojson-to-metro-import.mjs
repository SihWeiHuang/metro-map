/**
 * Convert station-point GeoJSON (e.g. northern-taiwan.geojson) to metro-multiverse import JSON.
 *
 * Usage:
 *   node scripts/geojson-to-metro-import.mjs [input.geojson] [output.json]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_IN = path.join(ROOT, "data", "northern-taiwan.geojson");
const DEFAULT_OUT = path.join(ROOT, "route data", "northern-taiwan-import.json");

const FORMAT = "metro-multiverse";
const FORMAT_VERSION = 2;
/** Splits only large gaps between station codes (e.g. 中和線 O21 ↔ 蘆洲線 O50) */
const SEGMENT_GAP_DEG = 0.05;

function parseStationCode(code) {
  const m = String(code ?? "").match(/^([A-Z]+)(\d+)([a-z]*)$/i);
  if (!m) return { prefix: String(code), num: 0, suffix: "" };
  return { prefix: m[1].toUpperCase(), num: parseInt(m[2], 10), suffix: (m[3] || "").toLowerCase() };
}

function compareStationCode(a, b) {
  const pa = parseStationCode(a);
  const pb = parseStationCode(b);
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
  if (pa.num !== pb.num) return pa.num - pb.num;
  return pa.suffix.localeCompare(pb.suffix);
}

function isSpurCode(code) {
  const { suffix, num } = parseStationCode(code);
  return num > 0 && suffix.length > 0;
}

/** Normalize station codes for lookup (G03, G03A, R22A). */
function normalizeStationCode(code) {
  const m = String(code ?? "").match(/^([A-Z]+)(\d+)([a-z]*)$/i);
  if (!m) return String(code ?? "");
  return `${m[1].toUpperCase()}${parseInt(m[2], 10)}${(m[3] || "").toLowerCase()}`;
}

function spurBaseCode(code) {
  const m = String(code ?? "").match(/^([A-Z]+)(\d+)([a-z]+)$/i);
  if (!m) return "";
  return `${m[1].toUpperCase()}${parseInt(m[2], 10)}`;
}

function coordDistDeg(a, b) {
  const [lng1, lat1] = a.geometry.coordinates;
  const [lng2, lat2] = b.geometry.coordinates;
  return Math.hypot(lng2 - lng1, lat2 - lat1);
}

function stationDisplayName(zhName) {
  const n = String(zhName ?? "").trim();
  if (!n) return "未知站";
  return n.endsWith("站") ? n : `${n}站`;
}

function splitByGap(stations) {
  if (!stations.length) return [];
  /** @type {typeof stations[]} */
  const segments = [[stations[0]]];
  for (let i = 1; i < stations.length; i++) {
    const prev = segments[segments.length - 1].at(-1);
    const cur = stations[i];
    if (coordDistDeg(prev, cur) > SEGMENT_GAP_DEG) {
      segments.push([cur]);
    } else {
      segments[segments.length - 1].push(cur);
    }
  }
  return segments.filter((seg) => seg.length >= 1);
}

function lineStringFromStations(stations) {
  const coords = stations.map((s) => [...s.geometry.coordinates]);
  if (coords.length === 1) coords.push([...coords[0]]);
  return { type: "LineString", coordinates: coords };
}

function computeMapView(subroutes, stations) {
  const coords = [];
  for (const f of subroutes) {
    for (const c of f.geometry.coordinates) coords.push(c);
  }
  for (const f of stations) coords.push(f.geometry.coordinates);
  if (!coords.length) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  const padLng = (maxLng - minLng) * 0.08 || 0.02;
  const padLat = (maxLat - minLat) * 0.08 || 0.02;
  return {
    bounds: [
      [minLng - padLng, minLat - padLat],
      [maxLng + padLng, maxLat + padLat],
    ],
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
    zoom: 10,
  };
}

/**
 * @param {import('geojson').FeatureCollection} geojson
 */
export function convertGeoJsonToMetroImport(geojson, meta = {}) {
  const points = (geojson.features ?? []).filter(
    (f) => f?.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates)
  );

  /** @type {Map<string, { lineCode: string, lineName: string, color: string, stations: typeof points }>} */
  const byLine = new Map();
  for (const f of points) {
    const p = f.properties ?? {};
    const lineCode = String(p["路線編號"] ?? p.lineCode ?? "").trim();
    const lineName = String(p["路線名"] ?? p.lineName ?? lineCode).trim();
    if (!lineCode) continue;
    const key = lineCode;
    if (!byLine.has(key)) {
      byLine.set(key, {
        lineCode,
        lineName,
        color: String(p["marker-color"] ?? p.color ?? "#888888"),
        stations: [],
      });
    }
    byLine.get(key).stations.push(f);
  }

  const lineKeys = [...byLine.keys()].sort((a, b) => a.localeCompare(b));
  /** @type {import('geojson').Feature[]} */
  const subrouteFeatures = [];
  /** @type {import('geojson').Feature[]} */
  const stationFeatures = [];

  let subrouteCounter = 0;
  let stationCounter = 0;

  for (const lineCode of lineKeys) {
    const { lineName, color, stations: rawStations } = byLine.get(lineCode);
    const routeId = `line_${lineCode}`;

    const sorted = [...rawStations].sort((a, b) =>
      compareStationCode(a.properties?.["車站編號"] ?? a.properties?.stationCode, b.properties?.["車站編號"] ?? b.properties?.stationCode)
    );

    const byCode = new Map();
    for (const st of sorted) {
      const code = String(st.properties?.["車站編號"] ?? st.properties?.stationCode ?? "");
      if (code) byCode.set(normalizeStationCode(code), st);
    }

    /** @type {typeof sorted[]} */
    const branchSegments = [];
    const mainStations = [];

    for (const st of sorted) {
      const code = String(st.properties?.["車站編號"] ?? st.properties?.stationCode ?? "");
      if (isSpurCode(code)) {
        const base = spurBaseCode(code);
        const baseSt = byCode.get(normalizeStationCode(base));
        if (baseSt) {
          branchSegments.push([baseSt, st]);
          continue;
        }
      }
      mainStations.push(st);
    }

    const mainSegments = splitByGap(mainStations).filter((seg) => seg.length >= 2);
    const allSegments = [
      ...mainSegments,
      ...branchSegments.filter((seg) => seg.length >= 2),
    ];

    for (const segment of allSegments) {
      if (segment.length < 2) continue;
      subrouteCounter += 1;
      const subrouteId = `r${subrouteCounter}`;

      subrouteFeatures.push({
        type: "Feature",
        geometry: lineStringFromStations(segment),
        properties: {
          subroute_id: subrouteId,
          route_id: routeId,
          name: lineName,
          color,
          route_kind: "user",
          country: "TW",
          region: "雙北",
          status: "operating",
        },
      });

      for (const st of segment) {
        stationCounter += 1;
        const zh = st.properties?.["中文站名"] ?? st.properties?.nameZh ?? "";
        stationFeatures.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [...st.geometry.coordinates],
          },
          properties: {
            station_id: `s${stationCounter}`,
            subroute_id: subrouteId,
            name: stationDisplayName(zh),
            color,
          },
        });
      }
    }
  }

  const mapView = computeMapView(subrouteFeatures, stationFeatures);

  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    v: FORMAT_VERSION,
    convertedFrom: meta.source ?? "geojson",
    userSubroutesFC: { type: "FeatureCollection", features: subrouteFeatures },
    userStationsFC: { type: "FeatureCollection", features: stationFeatures },
    hiddenSubrouteIds: [],
    counters: {
      route: lineKeys.length,
      subroute: subrouteCounter,
      station: stationCounter,
    },
    settings: { stationMinPerRoute: 0 },
    ...(mapView ? { mapView } : {}),
  };
}

function main() {
  const inputPath = path.resolve(process.argv[2] ?? DEFAULT_IN);
  const outputPath = path.resolve(process.argv[3] ?? DEFAULT_OUT);

  if (!fs.existsSync(inputPath)) {
    console.error(`找不到輸入檔：${inputPath}`);
    process.exit(1);
  }

  const geojson = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (geojson.type !== "FeatureCollection") {
    console.error("僅支援 GeoJSON FeatureCollection");
    process.exit(1);
  }

  const payload = convertGeoJsonToMetroImport(geojson, { source: path.basename(inputPath) });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");

  const byName = new Map();
  for (const f of payload.userSubroutesFC.features) {
    const n = f.properties.name;
    byName.set(n, (byName.get(n) ?? 0) + 1);
  }

  console.log(`已輸出：${outputPath}`);
  console.log(`子路線：${payload.userSubroutesFC.features.length}，車站：${payload.userStationsFC.features.length}`);
  for (const [name, count] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"))) {
    console.log(`  ${name}：${count} 段`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
