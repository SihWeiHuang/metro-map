/** @typedef {'legal' | 'about' | 'support'} SitePageId */

/** @type {SitePageId[]} */
export const SITE_PAGE_IDS = ["legal", "about", "support"];

/**
 * @param {string} hash
 * @returns {SitePageId | null}
 */
export function parseSitePageFromHash(hash) {
  const raw = (hash || "").replace(/^#/, "").trim().toLowerCase();
  const path = raw.startsWith("/") ? raw.slice(1) : raw;
  if (path === "legal" || path === "privacy" || path === "terms") return "legal";
  if (path === "about") return "about";
  if (path === "support" || path === "sponsor") return "support";
  return null;
}

/** @param {SitePageId} pageId */
export function sitePageHash(pageId) {
  return `#/${pageId}`;
}
