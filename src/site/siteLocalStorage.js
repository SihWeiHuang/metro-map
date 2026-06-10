/** Prefix for all localStorage keys written by this site. */
export const SITE_LOCAL_STORAGE_PREFIX = "metro-";

/**
 * Remove every localStorage entry owned by this site (keys starting with `metro-`).
 * Includes route data, map view, locale, route-list UI prefs, and other site settings.
 */
export function clearSiteLocalStorage() {
  if (typeof localStorage === "undefined") return;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SITE_LOCAL_STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore quota / private mode */
  }
}
