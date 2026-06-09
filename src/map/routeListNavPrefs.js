import {
  GEO_COUNTRY_TW,
  GEO_REGION_OTHER,
  buildCityOptions,
  canonicalizeCountryId,
  canonicalizeRegion,
} from "./geoCatalog.js";

function isExcludedCityNavId(countryId, regionId) {
  const cid = canonicalizeCountryId(countryId);
  const rid = canonicalizeRegion(regionId);
  return cid === GEO_COUNTRY_TW && rid === GEO_REGION_OTHER;
}

function listCitiesForNavCountry(countryId, routes) {
  return buildCityOptions(countryId, routes, { includeOther: true }).filter(
    (opt) => !isExcludedCityNavId(countryId, opt.regionId),
  );
}

export const ROUTE_LIST_NAV_STORAGE_KEY = "metro-map-route-list-nav-v1";

/** @typedef {"country" | "city" | "routes"} RouteListNavLevel */

/**
 * @returns {{ level: RouteListNavLevel, countryId: string, regionId: string } | null}
 */
export function loadRouteListNav() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ROUTE_LIST_NAV_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const level = data.level;
    if (level !== "country" && level !== "city" && level !== "routes") return null;
    const countryId = canonicalizeCountryId(data.countryId);
    const regionId = canonicalizeRegion(data.regionId);
    if (level === "city" && countryId === "") return null;
    if (level === "routes" && (countryId === "" || regionId === "")) return null;
    return { level, countryId, regionId };
  } catch {
    return null;
  }
}

/**
 * 依路線清單目前導覽層級，解析新路線應隸屬的地區／城市。
 * 停在城市列表層時取該地區第一個有效城市。
 * @param {Array<{ country?: unknown, region?: unknown }>} [routes]
 * @returns {{ country: string, region: string } | null}
 */
export function resolveRouteListNavGeoForNewRoute(routes = []) {
  const nav = loadRouteListNav();
  if (!nav) return null;
  if (nav.level === "routes" && nav.countryId !== "" && nav.regionId !== "") {
    if (isExcludedCityNavId(nav.countryId, nav.regionId)) return null;
    return { country: nav.countryId, region: nav.regionId };
  }
  if (nav.level === "city" && nav.countryId !== "") {
    const cities = listCitiesForNavCountry(nav.countryId, routes);
    if (cities.length === 0) return null;
    return { country: nav.countryId, region: cities[0].regionId };
  }
  return null;
}

export function saveRouteListNav({ level, countryId = "", regionId = "" }) {
  if (typeof localStorage === "undefined") return;
  if (level !== "country" && level !== "city" && level !== "routes") return;
  try {
    const payload = {
      level,
      countryId: canonicalizeCountryId(countryId),
      regionId: canonicalizeRegion(regionId),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(ROUTE_LIST_NAV_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}
