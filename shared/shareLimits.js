/** @typedef {{ ok: true } | { ok: false, code: string }} ShareValidationResult */

export const EXPORT_FILE_FORMAT = "metro-multiverse";

/** Max user-drawn lines (unique route_id) site-wide. */
export const MAX_USER_ROUTES = 30;

/** Max JSON body size for a share link (KiB, shown in UI). */
export const SHARE_PAYLOAD_MAX_KB = 64;

/** Max JSON body size for a share link (bytes). */
export const MAX_SHARE_PAYLOAD_BYTES = SHARE_PAYLOAD_MAX_KB * 1024;

/** Share link TTL (seconds). */
export const SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;

export const SHARE_TTL_DAYS = 30;

/** Max share links created per IP per calendar day (UTC). */
export const MAX_SHARE_CREATES_PER_IP_PER_DAY = 8;

export const SHARE_ID_PATTERN = /^[a-zA-Z0-9_-]{8}$/;

const ROUTE_KIND_DEFAULT = "default";
const ROUTE_KIND_USER = "user";

/**
 * @param {unknown} feature
 */
function routeKindOf(feature) {
  const kind = feature?.properties?.route_kind;
  return kind === ROUTE_KIND_DEFAULT || kind === ROUTE_KIND_USER ? kind : ROUTE_KIND_USER;
}

/**
 * Unique user line count (route_id) in an export/share payload. Matches map import rules.
 * @param {Record<string, unknown>} data
 */
export function countUserRoutesInSharePayload(data) {
  const subroutes =
    Array.isArray(data.userSubroutesFC?.features) ? data.userSubroutesFC.features : data.subroutesFC?.features;
  if (!Array.isArray(subroutes)) return 0;
  const ids = new Set();
  for (const f of subroutes) {
    if (routeKindOf(f) !== ROUTE_KIND_USER) continue;
    const routeId = f?.properties?.route_id;
    if (typeof routeId === "string") ids.add(routeId);
  }
  return ids.size;
}

/**
 * @param {unknown} raw
 * @returns {ShareValidationResult}
 */
export function validateSharePayloadObject(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_json" };
  const data = /** @type {Record<string, unknown>} */ (raw);
  if (data.format && data.format !== EXPORT_FILE_FORMAT) {
    return { ok: false, code: "unsupported_format" };
  }
  const subroutes =
    Array.isArray(data.userSubroutesFC?.features) ? data.userSubroutesFC.features : data.subroutesFC?.features;
  const stations =
    Array.isArray(data.userStationsFC?.features) ? data.userStationsFC.features : data.stationsFC?.features;
  if (!Array.isArray(subroutes) || subroutes.length === 0) {
    return { ok: false, code: "no_routes" };
  }
  if (!Array.isArray(stations)) {
    return { ok: false, code: "missing_features" };
  }
  const userRouteCount = countUserRoutesInSharePayload(data);
  if (userRouteCount === 0) {
    return { ok: false, code: "no_routes" };
  }
  if (userRouteCount > MAX_USER_ROUTES) {
    return { ok: false, code: "too_many_routes" };
  }
  return { ok: true };
}

/**
 * @param {string} jsonText
 * @returns {ShareValidationResult}
 */
export function validateSharePayloadText(jsonText) {
  if (typeof jsonText !== "string" || !jsonText.trim()) {
    return { ok: false, code: "invalid_json" };
  }
  const byteLen = new TextEncoder().encode(jsonText).length;
  if (byteLen > MAX_SHARE_PAYLOAD_BYTES) {
    return { ok: false, code: "payload_too_large" };
  }
  try {
    return validateSharePayloadObject(JSON.parse(jsonText));
  } catch {
    return { ok: false, code: "invalid_json" };
  }
}
