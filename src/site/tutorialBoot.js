import { parseShareIdFromPathname } from "../share/parseSharePath.js";
import { parseSitePageFromHash } from "./siteRoutes.js";

/**
 * Auto-open tutorial on full page load (first visit, refresh, reset-to-default reload).
 * Skip share links and site info hash routes (#/about, etc.).
 * @returns {boolean}
 */
export function shouldAutoOpenTutorialOnBoot() {
  if (typeof window === "undefined") return false;
  if (parseShareIdFromPathname(window.location.pathname)) return false;
  if (parseSitePageFromHash(window.location.hash)) return false;
  return true;
}
