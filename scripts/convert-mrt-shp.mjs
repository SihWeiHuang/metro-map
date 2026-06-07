/**
 * Convert NLSC MRT shapefile (捷運_1150409) to Metro Multiverse import JSON.
 *
 * Usage:
 *   npm run convert:mrt
 *   npm run convert:mrt -- --operating-only   # exclude construction / interrupted
 *
 * Output: data/taipei-mrt-import.json (open in any text editor, import via site UI)
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
const SHP_PATH = path.join(ROOT, "捷運_1150409", "MRT_1150409.shp");
const DBF_PATH = path.join(ROOT, "捷運_1150409", "MRT_1150409.dbf");
const STATION_SHP_PATH = path.join(ROOT, "捷運車站_1150409", "MARK_捷運車站_1150409.shp");
const STATION_DBF_PATH = path.join(ROOT, "捷運車站_1150409", "MARK_捷運車站_1150409.dbf");
const OUT_PATH = path.join(ROOT, "data", "taipei-mrt-import.json");

/** Max distance from route line to attach a station (meters). */
const STATION_SNAP_METERS = 150;

const TWD97_TM2 = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const WGS84 = "EPSG:4326";

/** @type {Set<string>} */
const TARGET_SYSTEMS = new Set(["臺北捷運", "新北捷運"]);

/** Official line colors (approximate). */
const LINE_COLORS = {
  文湖線: "#C48C31",
  淡水信義線: "#E3002C",
  板南線: "#0070BD",
  松山新店線: "#008659",
  中和新蘆線: "#F8B61C",
  新北投線: "#E3002C",
  小碧潭線: "#008659",
  環狀線: "#FFDB00",
  三鶯線: "#9E9E9E",
  貓空纜車: "#795548",
};

function trim(v) {
  return typeof v === "string" ? v.trim() : "";
}

function toLngLat([x, y]) {
  const [lng, lat] = proj4(TWD97_TM2, WGS84, [x, y]);
  return [lng, lat];
}

function transformLineCoords(coords) {
  return coords.map(toLngLat);
}

function mapStatus(status) {
  const n = Number(status);
  if (n === 0) return "operating";
  if (n === 1) return "construction";
  if (n === 2) return "planning";
  return "custom";
}

/** Worst status wins when merging segments (construction > planning > operating). */
function combineSegmentStatuses(segments) {
  const order = { construction: 3, planning: 2, custom: 1, operating: 0 };
  let worst = "operating";
  for (const seg of segments) {
    const s = mapStatus(seg.properties?.STATUS);
    if ((order[s] ?? 0) > (order[worst] ?? 0)) worst = s;
  }
  return worst;
}

function pickColor(lineName) {
  return LINE_COLORS[lineName] ?? "#1e88e5";
}

function coordsClose(a, b, meters = 3) {
  return turf.distance(turf.point(a), turf.point(b), { units: "meters" }) < meters;
}

/** Chain segments that share endpoints (shapefile stores many small pieces per line). */
function mergeSegments(segmentFeatures) {
  if (!segmentFeatures.length) return [];
  /** @type {number[][][]} */
  let pool = segmentFeatures.map((f) => f.geometry.coordinates.map((c) => [...c]));

  /** @type {number[][][]} */
  const results = [];

  while (pool.length) {
    let chain = pool.pop();
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = pool.length - 1; i >= 0; i--) {
        const seg = pool[i];
        const chainStart = chain[0];
        const chainEnd = chain[chain.length - 1];
        const segStart = seg[0];
        const segEnd = seg[seg.length - 1];

        if (coordsClose(chainEnd, segStart)) {
          chain = chain.concat(seg.slice(1));
          pool.splice(i, 1);
          changed = true;
        } else if (coordsClose(chainEnd, segEnd)) {
          chain = chain.concat([...seg].reverse().slice(1));
          pool.splice(i, 1);
          changed = true;
        } else if (coordsClose(chainStart, segEnd)) {
          chain = seg.concat(chain.slice(1));
          pool.splice(i, 1);
          changed = true;
        } else if (coordsClose(chainStart, segStart)) {
          chain = [...seg].reverse().concat(chain.slice(1));
          pool.splice(i, 1);
          changed = true;
        }
      }
    }
    results.push(chain);
  }
  return results;
}

function simplifyCoords(coords, toleranceMeters = 8) {
  if (coords.length < 3) return coords;
  const line = turf.lineString(coords);
  const simplified = turf.simplify(line, { tolerance: toleranceMeters / 111320, highQuality: true });
  return simplified.geometry.coordinates;
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

function isShuangbeiStationRecord(markname1) {
  return /^(臺北捷運|台北捷運|新北捷運)/.test(trim(markname1));
}

/** e.g. "臺北捷運台北車站_R10" → "台北車站" */
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

/** Prefer non-entrance records; centroid when several points share a station name. */
function buildStationCentroids(attributes, geometries) {
  /** @type {Map<string, { key: string, points: { coord: number[], isEntrance: boolean }[] }>} */
  const groups = new Map();

  for (let i = 0; i < attributes.length; i++) {
    const markname1 = trim(attributes[i].MARKNAME1);
    if (!isShuangbeiStationRecord(markname1)) continue;
    const key = parseStationKey(markname1);
    if (!key) continue;
    const geometry = geometries[i];
    if (geometry.type !== "Point") continue;

    if (!groups.has(key)) groups.set(key, { key, points: [] });
    groups.get(key).points.push({
      coord: toLngLat(geometry.coordinates),
      isEntrance: markname1.includes("出入口"),
    });
  }

  /** @type {{ key: string, name: string, coord: number[] }[]} */
  const stations = [];
  for (const { key, points } of groups.values()) {
    const main = points.filter((p) => !p.isEntrance);
    const use = main.length > 0 ? main : points;
    const coord =
      use.length === 1
        ? use[0].coord
        : turf.center(turf.multiPoint(use.map((p) => p.coord))).geometry.coordinates;
    stations.push({ key, name: stationDisplayName(key), coord });
  }

  return stations.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}

function findRouteMatches(coord, routeFeatures, maxMeters) {
  /** @type {{ subroute_id: string, route_id: string, dist: number, color: string }[]} */
  const hits = [];
  for (const route of routeFeatures) {
    const coords = route.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const snapped = turf.nearestPointOnLine(turf.lineString(coords), coord, { units: "meters" });
    if (snapped.properties.dist <= maxMeters) {
      hits.push({
        subroute_id: route.properties.subroute_id,
        route_id: route.properties.route_id,
        dist: snapped.properties.dist,
        color: route.properties.color,
      });
    }
  }
  hits.sort((a, b) => a.dist - b.dist);
  return hits;
}

/** One match per route (branch subroutes share route_id). */
function dedupeMatchesByRoute(matches) {
  const seen = new Set();
  const out = [];
  for (const m of matches) {
    if (seen.has(m.route_id)) continue;
    seen.add(m.route_id);
    out.push(m);
  }
  return out;
}

function buildStationFeatures(stationCentroids, routeFeatures) {
  const features = [];
  let stationCounter = 1;
  const unmatched = [];

  for (const st of stationCentroids) {
    const matches = dedupeMatchesByRoute(findRouteMatches(st.coord, routeFeatures, STATION_SNAP_METERS));
    if (!matches.length) {
      unmatched.push(st.name);
      continue;
    }

    const primary = matches[0];
    const isTransfer = matches.length >= 2;
    const props = {
      station_id: `s${stationCounter++}`,
      subroute_id: primary.subroute_id,
      name: st.name,
      color: primary.color,
    };
    if (isTransfer) {
      props.is_transfer_fixed = true;
      props.transfer_routes = matches.slice(1).map((m) => m.subroute_id);
    }

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: st.coord },
      properties: props,
    });
  }

  return { features, stationCounter, unmatched };
}

async function main() {
  const operatingOnly = process.argv.includes("--operating-only");

  if (!fs.existsSync(SHP_PATH) || !fs.existsSync(DBF_PATH)) {
    console.error(`找不到 Shapefile：${SHP_PATH}`);
    console.error("請確認已將官方下載的 捷運_1150409 資料夾放在專案根目錄。");
    process.exit(1);
  }

  const [attributes, geometries] = await Promise.all([
    DBFFile.open(DBF_PATH, { encoding: "utf-8" }).then((dbf) => dbf.readRecords()),
    readShapeGeometries(SHP_PATH),
  ]);

  if (attributes.length !== geometries.length) {
    throw new Error(`屬性列數 (${attributes.length}) 與幾何列數 (${geometries.length}) 不一致`);
  }

  /** @type {Map<string, { lineName: string, system: string, status: string, segments: import('@turf/turf').Feature<import('@turf/turf').LineString>[] }>} */
  const groups = new Map();

  for (let i = 0; i < attributes.length; i++) {
    const properties = attributes[i];
    const geometry = geometries[i];
    const system = trim(properties.MRTSYS);
    const lineName = trim(properties.MRTCODE);
    const status = Number(properties.STATUS);

    if (!TARGET_SYSTEMS.has(system)) continue;
    if (!lineName) continue;
    if (operatingOnly && status !== 0) continue;
    if (geometry.type !== "LineString" || geometry.coordinates.length < 2) continue;

    const key = `${system}::${lineName}`;
    if (!groups.has(key)) {
      groups.set(key, { lineName, system, segments: [] });
    }
    groups.get(key).segments.push(
      turf.lineString(transformLineCoords(geometry.coordinates), {
        MRTID: properties.MRTID,
        STATUS: status,
      })
    );
  }

  const routeFeatures = [];
  const groupMeta = [];
  let subrouteCounter = 1;
  let routeCounter = 1;

  for (const [, group] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"))) {
    const routeId = `g${routeCounter++}`;
    const mergedLines = mergeSegments(group.segments);
    const groupStatus = combineSegmentStatuses(group.segments);
    groupMeta.push({
      routeId,
      lineName: group.lineName,
      system: group.system,
      parts: mergedLines.length,
      status: groupStatus,
    });

    for (const coords of mergedLines) {
      const simplified = simplifyCoords(coords);
      if (simplified.length < 2) continue;
      routeFeatures.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: simplified },
        properties: {
          subroute_id: `r${subrouteCounter++}`,
          route_id: routeId,
          name: group.lineName,
          color: pickColor(group.lineName),
          route_kind: "user",
          country: "TW",
          region: "大台北地區",
          status: groupStatus,
        },
      });
    }
  }

  const payload = {
    format: "metro-multiverse",
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    v: 2,
    userSubroutesFC: { type: "FeatureCollection", features: routeFeatures },
    userStationsFC: { type: "FeatureCollection", features: [] },
    hiddenSubrouteIds: [],
    counters: {
      subroute: subrouteCounter,
      route: routeCounter,
      station: 1,
    },
    settings: { stationMinPerRoute: 1 },
  };

  let stationMeta = { count: 0, transfers: 0, unmatched: [] };

  if (fs.existsSync(STATION_SHP_PATH) && fs.existsSync(STATION_DBF_PATH)) {
    const [stationAttrs, stationGeoms] = await Promise.all([
      DBFFile.open(STATION_DBF_PATH, { encoding: "utf-8" }).then((dbf) => dbf.readRecords()),
      readShapeGeometries(STATION_SHP_PATH),
    ]);
    if (stationAttrs.length !== stationGeoms.length) {
      throw new Error(`車站屬性列數 (${stationAttrs.length}) 與幾何列數 (${stationGeoms.length}) 不一致`);
    }
    const centroids = buildStationCentroids(stationAttrs, stationGeoms);
    const { features: stationFeatures, stationCounter, unmatched } = buildStationFeatures(centroids, routeFeatures);
    payload.userStationsFC.features = stationFeatures;
    payload.counters.station = stationCounter;
    stationMeta = {
      count: stationFeatures.length,
      transfers: stationFeatures.filter((f) => f.properties?.is_transfer_fixed).length,
      unmatched,
    };
  } else {
    console.warn("未找到 捷運車站_1150409，略過車站轉換。");
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");

  console.log(`已轉換 ${routeFeatures.length} 條子路線（${groupMeta.length} 條路線）`);
  if (stationMeta.count > 0) {
    console.log(`已併入 ${stationMeta.count} 個車站（其中 ${stationMeta.transfers} 個轉乘站）`);
    if (stationMeta.unmatched.length) {
      console.warn(`未能對應路線的車站：${stationMeta.unmatched.join("、")}`);
    }
  }
  console.log(`輸出：${OUT_PATH}`);
  console.log("");
  console.log("路線：");
  for (const g of groupMeta) {
    const statusNote = g.status === "operating" ? "營運中" : g.status === "construction" ? "興建中" : g.status;
    console.log(`  ${g.system} / ${g.lineName} → ${g.parts} 段 (${g.routeId}) [${statusNote}]`);
  }
  console.log("");
  console.log("下一步：用 VS Code 開啟上述 JSON，或在網站選「匯入路線」上傳此檔。");
  if (stationMeta.count === 0) {
    console.log("（目前僅含路線；若已下載車站資料，請將 捷運車站_1150409 放在專案根目錄後重新執行。）");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
