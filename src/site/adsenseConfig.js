/** Google AdSense — set in Vercel / local `.env` after AdSense approval or for site review. */
export const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT?.trim() || "";

/** Optional display ad unit slot ID; omit during initial review if not created yet. */
export const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT?.trim() || "";

/**
 * @returns {boolean}
 */
export function isAdsenseConfigured() {
  return Boolean(ADSENSE_CLIENT);
}
