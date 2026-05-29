import { SHARE_ID_PATTERN } from "../../shared/shareLimits.js";

/**
 * @param {string} pathname
 * @returns {string | null}
 */
export function parseShareIdFromPathname(pathname) {
  const match = pathname.match(/^\/r\/([^/]+)\/?$/);
  if (!match) return null;
  const id = match[1];
  return SHARE_ID_PATTERN.test(id) ? id : null;
}

/**
 * @param {string} id
 * @returns {string}
 */
export function buildSharePath(id) {
  return `/r/${id}`;
}

/**
 * @param {string} id
 * @returns {string}
 */
export function buildShareUrl(id) {
  if (typeof window === "undefined") return buildSharePath(id);
  return `${window.location.origin}${buildSharePath(id)}`;
}
