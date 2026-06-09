import {
  GEO_COUNTRY_OTHER,
  GEO_COUNTRY_TW,
  GEO_REGION_OTHER,
  buildCityOptions,
  buildCountryOptions,
  canonicalizeCountryId,
  canonicalizeRegion,
  getCityLabelKey,
  getCountryLabelKey,
} from "../map/geoCatalog.js";

/** 路線清單導覽：台灣內不顯示「其他城市」（「其他地區」內仍保留） */
function isExcludedCityNavId(countryId, regionId) {
  const cid = canonicalizeCountryId(countryId);
  const rid = canonicalizeRegion(regionId);
  return cid === GEO_COUNTRY_TW && rid === GEO_REGION_OTHER;
}

/** @param {unknown} countryId @param {(key: string) => string} t */
export function formatCountryLabel(countryId, t) {
  const cid = canonicalizeCountryId(countryId);
  const key = getCountryLabelKey(cid);
  if (key) return t(key);
  if (cid === GEO_COUNTRY_OTHER) return t("geo.otherCountry");
  return cid;
}

/** @param {unknown} regionId @param {(key: string) => string} t */
export function formatRegionLabel(regionId, t) {
  const rid = canonicalizeRegion(regionId);
  const key = getCityLabelKey(rid);
  if (key) return t(key);
  if (rid === GEO_REGION_OTHER) return t("geo.otherCity");
  return rid;
}

/**
 * @param {Array<{ country?: unknown, region?: unknown }>} routeList
 * @param {unknown} countryId
 * @param {unknown} regionId
 */
export function filterRoutesForGeo(routeList, countryId, regionId) {
  const cid = canonicalizeCountryId(countryId);
  const rid = canonicalizeRegion(regionId);
  return routeList.filter(
    (r) => canonicalizeCountryId(r.country) === cid && canonicalizeRegion(r.region) === rid,
  );
}

/**
 * @param {Array<{ country?: unknown }>} routeList
 * @param {unknown} countryId
 */
export function countRoutesInCountry(routeList, countryId) {
  const cid = canonicalizeCountryId(countryId);
  return routeList.filter((r) => canonicalizeCountryId(r.country) === cid).length;
}

/**
 * @param {Array<{ country?: unknown, region?: unknown }>} routeList
 * @param {unknown} countryId
 * @param {unknown} regionId
 */
export function countRoutesInCity(routeList, countryId, regionId) {
  return filterRoutesForGeo(routeList, countryId, regionId).length;
}

/**
 * @param {Array<{ country?: unknown, region?: unknown }>} routeList
 * @returns {Array<{ countryId: string, fromCatalog: boolean, routeCount: number }>}
 */
export function buildCountryNavEntries(routeList) {
  return buildCountryOptions(routeList).map((opt) => ({
    ...opt,
    routeCount: countRoutesInCountry(routeList, opt.countryId),
  }));
}

/**
 * @param {Array<{ country?: unknown, region?: unknown }>} routeList
 * @param {unknown} countryId
 * @returns {Array<{ regionId: string, fromCatalog: boolean, routeCount: number }>}
 */
export function buildCityNavEntries(routeList, countryId) {
  return buildCityOptions(countryId, routeList)
    .filter((opt) => !isExcludedCityNavId(countryId, opt.regionId))
    .map((opt) => ({
      ...opt,
      routeCount: countRoutesInCity(routeList, countryId, opt.regionId),
    }));
}

/**
 * 若導覽停在台灣內已隱藏的「其他城市」，退回城市列表。
 * @param {"country" | "city" | "routes"} level
 * @param {unknown} countryId
 * @param {unknown} regionId
 */
export function sanitizeRouteListNavSelection(level, countryId, regionId) {
  const cid = canonicalizeCountryId(countryId);
  const rid = canonicalizeRegion(regionId);
  if (isExcludedCityNavId(cid, rid)) {
    if (level === "routes") {
      return { level: "city", countryId: cid, regionId: "" };
    }
    return { level, countryId: cid, regionId: "" };
  }
  return { level, countryId: cid, regionId: rid };
}
