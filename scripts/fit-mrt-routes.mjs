/**
 * Rebuild selected MRT lines as single sub-routes via station-ordered spline fitting.
 * Reads data/taipei-mrt-import.json and writes data/taipei-mrt-import-fitted.json
 * without modifying the original file.
 *
 * Usage: npm run fit:mrt
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DBFFile } from "dbffile";
import * as shapefile from "shapefile";
import proj4 from "proj4";
import * as turf from "@turf/turf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_PATH = path.join(ROOT, "data", "taipei-mrt-import.json");
const OUT_PATH = path.join(ROOT, "data", "taipei-mrt-import-fitted.json");
const STATION_SHP_PATH = path.join(ROOT, "捷運車站_1150409", "MARK_捷運車站_1150409.shp");
const STATION_DBF_PATH = path.join(ROOT, "捷運車站_1150409", "MARK_捷運車站_1150409.dbf");

const TWD97_TM2 = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const WGS84 = "EPSG:4326";

/** Lines to rebuild as one fitted sub-route each. */
const FIT_LINE_NAMES = new Set(["新北投線", "文湖線", "環狀線", "三鶯線", "淡水信義線"]);

/** Official station code order (open path; 環狀線 intentionally not closed). */
const STATION_CODE_ORDERS = {
  新北投線: ["R22", "R22A"],
  文湖線: [
    "BR01", "BR02", "BR03", "BR04", "BR05", "BR06", "BR07", "BR08", "BR09", "BR10", "BR11", "BR12", "BR13",
    "BR14", "BR15", "BR16", "BR17", "BR18", "BR19", "BR20", "BR21", "BR22", "BR23", "BR24",
  ],
  環狀線: ["Y07", "Y08", "Y09", "Y10", "Y11", "Y12", "Y13", "Y14", "Y15", "Y16", "Y17", "Y18", "Y19", "Y20"],
  淡水信義線: [
    "R28", "R27", "R26", "R25", "R24", "R23", "R22", "R21", "R20", "R19", "R18", "R17", "R16", "R15", "R14",
    "R13", "R12", "R11", "R10", "R09", "R8", "R07", "R06", "R05", "R04", "R03", "R02",
  ],
  三鶯線: ["LB02", "LB03", "LB04", "LB05", "LB06", "LB07", "LB08", "LB09", "LB10", "LB11", "LB12"],
};

const LINE_CODE_MATCHERS = {
  新北投線: (code) => code === "R22" || code === "R22A",
  文湖線: (code) => /^BR\d/.test(code),
  環狀線: (code) => /^Y\d/.test(code),
  淡水信義線: (code) => /^R\d/.test(code) && code !== "R22A",
  三鶯線: (code) => /^LB\d/.test(code),
};

function trim(v) {
  return typeof v === "string" ? v.trim() : "";
}

function toLngLat([x, y]) {
  return proj4(TWD97_TM2, WGS84, [x, y]);
}

function normalizeStationCode(code) {
  const m = code.match(/^([A-Z]+)(\d+)([A-Z]?)$/);
  if (!m) return code;
  return `${m[1]}${parseInt(m[2], 10)}${m[3] ?? ""}`;
}

function parseStationCodes(markname1) {
  const matches = trim(markname1).match(/_([A-Z]+\d+[A-Z]?)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
}

function isShuangbeiStationRecord(markname1) {
  return /^(臺北捷運|台北捷運|新北捷運)/.test(trim(markname1));
}

function parseStationKey(markname1) {
  let s = trim(markname1);
  s = s.replace(/^(臺北|台北|新北)捷運/, "");
  s = s.split(/[-_]/)[0];
  s = s.replace(/站$/, "").trim();
  return s;
}

function stationDisplayName(key) {
  if (!key) return "未知站";
  return key.endsWith("站") ? key : `${key}站`;
}

async function readShapeGeometries(shpPath) {
  const geometries = [];
  const source = await shapefile.open(shpPath);
  let result = await source.read();
  while (!result.done) {
    geometries.push(result.value.geometry);
    result = await source.read();
  }
  return geometries;
}

function buildLineStationRecords(stationAttributes, stationGeometries) {
  /** @type {Map<string, Map<string, { code: string, key: string, name: string, coord: number[] }>>} */
  const byLine = new Map();
  for (const lineName of FIT_LINE_NAMES) {
    byLine.set(lineName, new Map());
  }

  for (let i = 0; i < stationAttributes.length; i++) {
    const markname1 = trim(stationAttributes[i].MARKNAME1);
    if (!isShuangbeiStationRecord(markname1)) continue;
    if (markname1.includes("出入口")) continue;

    const codes = parseStationCodes(markname1);
    if (!codes.length) continue;

    const key = parseStationKey(markname1);
    if (!key) continue;

    const geometry = stationGeometries[i];
    if (geometry.type !== "Point") continue;
    const coord = toLngLat(geometry.coordinates);

    for (const lineName of FIT_LINE_NAMES) {
      const matcher = LINE_CODE_MATCHERS[lineName];
      const matchedCode = codes.find(matcher);
      if (!matchedCode) continue;

      byLine.get(lineName).set(normalizeStationCode(matchedCode), {
        code: matchedCode,
        key,
        name: stationDisplayName(key),
        coord,
      });
    }
  }

  return byLine;
}

function getOrderedStationCoords(lineName, lineStationMap) {
  const order = STATION_CODE_ORDERS[lineName] ?? [];
  const coords = [];
  for (const code of order) {
    const station = lineStationMap.get(normalizeStationCode(code));
    if (station) coords.push([...station.coord]);
  }
  return coords;
}

function dedupeCoords(coords, minMeters = 0.5) {
  if (!coords.length) return [];
  /** @type {number[][]} */
  const out = [[...coords[0]]];
  for (let i = 1; i < coords.length; i++) {
    const prev = out[out.length - 1];
    const cur = coords[i];
    if (turf.distance(turf.point(prev), turf.point(cur), { units: "meters" }) >= minMeters) {
      out.push([...cur]);
    }
  }
  return out;
}

/** Catmull-Rom spline sampled into a LineString through control points. */
function fitSplineThroughPoints(controlPoints, segmentsPerSpan = 12) {
  const points = dedupeCoords(controlPoints, 1);
  if (points.length < 2) return points;
  if (points.length === 2) return points;

  const extended = [points[0], ...points, points[points.length - 1]];
  /** @type {number[][]} */
  const sampled = [];

  for (let i = 1; i < extended.length - 2; i++) {
    const p0 = extended[i - 1];
    const p1 = extended[i];
    const p2 = extended[i + 1];
    const p3 = extended[i + 2];
    const lastSpan = i === extended.length - 3;
    const steps = lastSpan ? segmentsPerSpan : segmentsPerSpan;
    for (let j = 0; j < steps; j++) {
      const t = j / segmentsPerSpan;
      sampled.push(catmullRomPoint(p0, p1, p2, p3, t));
    }
    if (lastSpan) sampled.push([...p2]);
  }

  return dedupeCoords(sampled, 0.5);
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (i) =>
    0.5 *
    (2 * p1[i] +
      (-p0[i] + p2[i]) * t +
      (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
      (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  return [f(0), f(1)];
}

function simplifyCoords(coords, toleranceMeters = 6) {
  if (coords.length < 3) return coords;
  const line = turf.lineString(coords);
  const simplified = turf.simplify(line, { tolerance: toleranceMeters / 111320, highQuality: true });
  return simplified.geometry.coordinates;
}

function remapRouteId(routeId, routeIdRemap) {
  if (typeof routeId !== "string") return routeId;
  return routeIdRemap.get(routeId) ?? routeId;
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`找不到來源檔：${SOURCE_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(STATION_SHP_PATH) || !fs.existsSync(STATION_DBF_PATH)) {
    console.error("找不到 捷運車站_1150409，無法依站序擬合。");
    process.exit(1);
  }

  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const [stationAttrs, stationGeoms] = await Promise.all([
    DBFFile.open(STATION_DBF_PATH, { encoding: "utf-8" }).then((dbf) => dbf.readRecords()),
    readShapeGeometries(STATION_SHP_PATH),
  ]);

  const stationsByLine = buildLineStationRecords(stationAttrs, stationGeoms);

  /** @type {Map<string, string[]>} */
  const oldRouteIdsByLine = new Map();
  for (const feature of source.userRoutesFC.features) {
    const name = feature.properties?.name;
    const routeId = feature.properties?.route_id;
    if (!FIT_LINE_NAMES.has(name) || typeof routeId !== "string") continue;
    if (!oldRouteIdsByLine.has(name)) oldRouteIdsByLine.set(name, []);
    oldRouteIdsByLine.get(name).push(routeId);
  }

  /** @type {Map<string, string>} old route_id -> consolidated route_id */
  const routeIdRemap = new Map();
  /** @type {import('@turf/turf').Feature<import('@turf/turf').LineString>[]} */
  const fittedRoutes = [];

  for (const lineName of [...FIT_LINE_NAMES].sort((a, b) => a.localeCompare(b, "zh-Hant"))) {
    const oldIds = (oldRouteIdsByLine.get(lineName) ?? []).sort(
      (a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10)
    );
    if (!oldIds.length) {
      console.warn(`略過 ${lineName}：來源檔中找不到路線。`);
      continue;
    }

    const template = source.userRoutesFC.features.find((f) => f.properties?.route_id === oldIds[0]);
    if (!template) continue;

    const controlPoints = getOrderedStationCoords(lineName, stationsByLine.get(lineName) ?? new Map());
    if (controlPoints.length < 2) {
      console.warn(`略過 ${lineName}：站點不足（${controlPoints.length}），無法擬合。`);
      continue;
    }

    const fitted = simplifyCoords(fitSplineThroughPoints(controlPoints));
    const keepRouteId = oldIds[0];
    for (const oldId of oldIds) {
      routeIdRemap.set(oldId, keepRouteId);
    }

    fittedRoutes.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: fitted },
      properties: { ...template.properties, route_id: keepRouteId },
    });

    console.log(
      `${lineName}：${oldIds.length} 段 → 1 段 (${keepRouteId})，${controlPoints.length} 站，${fitted.length} 點`
    );
  }

  const unchangedRoutes = source.userRoutesFC.features.filter((f) => !FIT_LINE_NAMES.has(f.properties?.name));

  const userRoutesFC = {
    type: "FeatureCollection",
    features: [...unchangedRoutes, ...fittedRoutes].sort(
      (a, b) => parseInt(a.properties.route_id.slice(1), 10) - parseInt(b.properties.route_id.slice(1), 10)
    ),
  };

  const userStationsFC = {
    type: "FeatureCollection",
    features: source.userStationsFC.features.map((feature) => {
      const props = { ...feature.properties };
      props.route_id = remapRouteId(props.route_id, routeIdRemap);
      if (Array.isArray(props.transfer_routes)) {
        props.transfer_routes = props.transfer_routes.map((id) => remapRouteId(id, routeIdRemap));
      }
      return {
        ...feature,
        properties: props,
      };
    }),
  };

  const payload = {
    ...source,
    format: "metro-map-x01",
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    fittedLines: [...FIT_LINE_NAMES],
    fittedFrom: path.basename(SOURCE_PATH),
    userRoutesFC,
    userStationsFC,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");

  const subRouteCounts = new Map();
  for (const f of userRoutesFC.features) {
    const name = f.properties.name;
    subRouteCounts.set(name, (subRouteCounts.get(name) ?? 0) + 1);
  }

  console.log("");
  console.log(`已輸出：${OUT_PATH}`);
  console.log("各路線子路線數：");
  for (const [name, count] of [...subRouteCounts.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"))) {
    const note = FIT_LINE_NAMES.has(name) ? "（已擬合）" : "";
    console.log(`  ${name}：${count}${note}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
