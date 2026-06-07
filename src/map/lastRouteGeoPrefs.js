import { canonicalizeCountryId, canonicalizeRegion } from "./geoCatalog.js";

export const LAST_ROUTE_GEO_STORAGE_KEY = "metro-map-last-route-geo-v1";

/**
 * @returns {{ country: string, region: string } | null}
 */
export function loadLastRouteGeo() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_ROUTE_GEO_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return {
      country: canonicalizeCountryId(data.country),
      region: canonicalizeRegion(data.region),
    };
  } catch {
    return null;
  }
}

/**
 * @param {unknown} country
 * @param {unknown} region
 */
export function saveLastRouteGeo(country, region) {
  if (typeof localStorage === "undefined") return;
  try {
    const payload = {
      country: canonicalizeCountryId(country),
      region: canonicalizeRegion(region),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(LAST_ROUTE_GEO_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}
