import { parseAdsensePublisherId } from "../../shared/adsensePublisherId.js";

const parsedPublisher = parseAdsensePublisherId(import.meta.env.VITE_ADSENSE_CLIENT);

/** Normalized ca-pub-… client ID for AdSense script / ins elements. */
export const ADSENSE_CLIENT = parsedPublisher?.caClient || "";

/** Optional display ad unit slot ID; omit during initial review if not created yet. */
export const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT?.trim() || "";

/**
 * @returns {boolean}
 */
export function isAdsenseConfigured() {
  return Boolean(ADSENSE_CLIENT);
}
