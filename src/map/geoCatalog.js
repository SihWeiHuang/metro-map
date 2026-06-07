/**
 * 國家／城市（region）目錄與地理中繼資料規則。
 *
 * 儲存慣例（寫入 route properties）：
 * - `country`：國家代碼（例如 "TW"、"JP"）；空字串表示「其他」
 * - `region`：城市／地區顯示名（例如 "雙北"）；空字串表示「其他」
 *
 * 畫面顯示名稱透過 i18n（geo.country.*）或直接使用自訂字串。
 */

import { DEFAULT_MAP_VIEW } from "./defaultMapViewConstants.js";

/** 未分類路線的 country 儲存值 */
export const GEO_COUNTRY_OTHER = "";

/** 未分類路線的 region 儲存值 */
export const GEO_REGION_OTHER = "";

/** 台灣國家代碼（與內建預設路線一致） */
export const GEO_COUNTRY_TW = "TW";

/**
 * 內建目錄：營運方預先定義的國家與城市，含地圖預設視野。
 *
 * 新增城市時請加入此陣列，例如：
 * `{ countryId: "JP", cities: [{ regionId: "東京", mapView: { center: [139.77, 35.68], zoom: 11, bearing: 0, pitch: 0 } }] }`
 * 若城市尚無預設路線且未列入此處，進入該城市時地圖不會移動。
 *
 * @type {Array<{ countryId: string, cities: Array<{ regionId: string, mapView: typeof DEFAULT_MAP_VIEW }> }>}
 */
export const BUILTIN_GEO_CATALOG = [
  {
    countryId: GEO_COUNTRY_TW,
    cities: [{ regionId: "雙北", mapView: DEFAULT_MAP_VIEW }],
  },
];

/** 有 i18n 翻譯的國家代碼 → key */
export const GEO_COUNTRY_LABEL_KEYS = {
  [GEO_COUNTRY_TW]: "geo.country.tw",
  JP: "geo.country.jp",
  [GEO_COUNTRY_OTHER]: "geo.otherCountry",
};

const COUNTRY_ALIAS_TO_ID = new Map([
  ["台灣", GEO_COUNTRY_TW],
  ["臺灣", GEO_COUNTRY_TW],
  ["taiwan", GEO_COUNTRY_TW],
  ["tw", GEO_COUNTRY_TW],
  ["日本", "JP"],
  ["japan", "JP"],
  ["jp", "JP"],
]);

/**
 * 將輸入正規化為儲存用 country 代碼。
 * @param {unknown} country
 * @returns {string}
 */
export function canonicalizeCountryId(country) {
  const raw = String(country ?? "").trim();
  if (!raw) return GEO_COUNTRY_OTHER;
  if (COUNTRY_ALIAS_TO_ID.has(raw)) return COUNTRY_ALIAS_TO_ID.get(raw);
  const lower = raw.toLowerCase();
  if (COUNTRY_ALIAS_TO_ID.has(lower)) return COUNTRY_ALIAS_TO_ID.get(lower);
  return raw;
}

/**
 * @param {unknown} region
 * @returns {string}
 */
export function canonicalizeRegion(region) {
  return String(region ?? "").trim();
}

/** @param {unknown} countryId */
export function isOtherCountry(countryId) {
  return canonicalizeCountryId(countryId) === GEO_COUNTRY_OTHER;
}

/** @param {unknown} region */
export function isOtherRegion(region) {
  return canonicalizeRegion(region) === GEO_REGION_OTHER;
}

/** @param {unknown} countryId @param {unknown} region */
export function isOtherGeo(countryId, region) {
  return isOtherCountry(countryId) && isOtherRegion(region);
}

/**
 * 目錄中該城市的地圖視野；無則 null。
 * @param {unknown} countryId
 * @param {unknown} region
 * @returns {typeof DEFAULT_MAP_VIEW | null}
 */
export function getCatalogMapView(countryId, region) {
  const cid = canonicalizeCountryId(countryId);
  const rid = canonicalizeRegion(region);
  const countryEntry = BUILTIN_GEO_CATALOG.find((c) => c.countryId === cid);
  const cityEntry = countryEntry?.cities.find((c) => c.regionId === rid);
  return cityEntry?.mapView ?? null;
}

/** @param {unknown} countryId @param {unknown} region */
export function hasCatalogMapView(countryId, region) {
  return getCatalogMapView(countryId, region) != null;
}

/**
 * i18n key；自訂國家無對應 key 時回傳 null（UI 改顯示原始字串）。
 * @param {unknown} countryId
 * @returns {string | null}
 */
export function getCountryLabelKey(countryId) {
  const cid = canonicalizeCountryId(countryId);
  return GEO_COUNTRY_LABEL_KEYS[cid] ?? null;
}

/**
 * 從路線清單彙總不重複的 (country, region) 組合。
 * @param {Array<{ country?: unknown, region?: unknown }>} routes
 * @returns {Array<{ countryId: string, regionId: string }>}
 */
export function collectGeoPairsFromRoutes(routes) {
  const seen = new Set();
  const pairs = [];
  for (const route of routes ?? []) {
    const countryId = canonicalizeCountryId(route.country);
    const regionId = canonicalizeRegion(route.region);
    const key = `${countryId}\0${regionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ countryId, regionId });
  }
  return pairs;
}

function compareCountryIds(a, b) {
  if (a === GEO_COUNTRY_OTHER) return 1;
  if (b === GEO_COUNTRY_OTHER) return -1;
  if (a === GEO_COUNTRY_TW) return -1;
  if (b === GEO_COUNTRY_TW) return 1;
  return a.localeCompare(b, "zh-Hant");
}

function compareRegionIds(a, b) {
  if (a === GEO_REGION_OTHER) return 1;
  if (b === GEO_REGION_OTHER) return -1;
  if (a === "雙北") return -1;
  if (b === "雙北") return 1;
  return a.localeCompare(b, "zh-Hant");
}

/**
 * 國家選項：內建目錄 + 路線中出現過的值 +「其他」（固定最後）。
 * @param {Array<{ country?: unknown, region?: unknown }>} [routes]
 * @returns {Array<{ countryId: string, fromCatalog: boolean }>}
 */
export function buildCountryOptions(routes = []) {
  const byId = new Map();

  for (const entry of BUILTIN_GEO_CATALOG) {
    byId.set(entry.countryId, { countryId: entry.countryId, fromCatalog: true });
  }

  for (const { countryId } of collectGeoPairsFromRoutes(routes)) {
    if (!byId.has(countryId)) {
      byId.set(countryId, { countryId, fromCatalog: false });
    }
  }

  const sorted = Array.from(byId.values()).sort((a, b) => compareCountryIds(a.countryId, b.countryId));

  // 路線中已有 country="" 時會先被 collectGeoPairsFromRoutes 收進 byId，勿重複追加。
  if (!byId.has(GEO_COUNTRY_OTHER)) {
    sorted.push({ countryId: GEO_COUNTRY_OTHER, fromCatalog: true });
  }

  return sorted;
}

/**
 * 城市選項：該國家的目錄城市 + 路線中出現過的值 +「其他」（固定最後）。
 * @param {unknown} countryId
 * @param {Array<{ country?: unknown, region?: unknown }>} [routes]
 * @returns {Array<{ regionId: string, fromCatalog: boolean }>}
 */
export function buildCityOptions(countryId, routes = []) {
  const cid = canonicalizeCountryId(countryId);
  const byId = new Map();

  const catalogEntry = BUILTIN_GEO_CATALOG.find((c) => c.countryId === cid);
  for (const city of catalogEntry?.cities ?? []) {
    byId.set(city.regionId, { regionId: city.regionId, fromCatalog: true });
  }

  for (const pair of collectGeoPairsFromRoutes(routes)) {
    if (pair.countryId !== cid) continue;
    if (!byId.has(pair.regionId)) {
      byId.set(pair.regionId, { regionId: pair.regionId, fromCatalog: false });
    }
  }

  const sorted = Array.from(byId.values()).sort((a, b) => compareRegionIds(a.regionId, b.regionId));

  if (!byId.has(GEO_REGION_OTHER)) {
    sorted.push({ regionId: GEO_REGION_OTHER, fromCatalog: true });
  }

  return sorted;
}

/**
 * 正規化要寫入 route 的 country / region。
 * @param {unknown} country
 * @param {unknown} region
 * @returns {{ country: string, region: string }}
 */
export function formatGeoPatch(country, region) {
  return {
    country: canonicalizeCountryId(country),
    region: canonicalizeRegion(region),
  };
}

/**
 * 合併 setRouteMetadata 用的 patch（僅處理 country / region 欄位）。
 * @param {Record<string, unknown>} patch
 * @returns {Record<string, unknown>}
 */
export function normalizeGeoMetadataPatch(patch) {
  if (!patch || typeof patch !== "object") return patch;
  const out = { ...patch };
  if ("country" in patch) out.country = canonicalizeCountryId(patch.country);
  if ("region" in patch) out.region = canonicalizeRegion(patch.region);
  return out;
}
