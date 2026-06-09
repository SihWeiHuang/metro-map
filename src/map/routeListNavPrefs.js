import { GEO_REGION_OTHER, canonicalizeCountryId, canonicalizeRegion } from "./geoCatalog.js";

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
 * @param {{ level: RouteListNavLevel, countryId?: unknown, regionId?: unknown }} nav
 */
/**
 * 依路線清單目前導覽層級，取得新路線資訊視窗的預設地區／城市。
 * @returns {{ country: string, region: string } | null}
 */
export function getRouteListNavGeoPreset() {
  const nav = loadRouteListNav();
  if (!nav) return null;
  if (nav.level === "routes" && nav.countryId !== "" && nav.regionId !== "") {
    return { country: nav.countryId, region: nav.regionId };
  }
  if (nav.level === "city" && nav.countryId !== "") {
    return { country: nav.countryId, region: GEO_REGION_OTHER };
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
