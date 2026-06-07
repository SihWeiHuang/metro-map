/**
 * Persisted visibility for route list table columns (header + cells).
 *
 * Third-layer only (RouteListPanel). Layers 1–2 geo navigation (country / city) lives in
 * RouteListNavigator + routeListGeoNav.js. Toggleable columns here: status badge, kind tag.
 * Name is always shown; edit-mode actions column is not part of this prefs module.
 */

export const ROUTE_LIST_COLS_STORAGE_KEY = "metro-map-route-list-columns-v1";

/** @typedef {"kind" | "status"} RouteListToggleableColKey */

export const ROUTE_LIST_TOGGLEABLE_COL_KEYS = /** @type {const} */ (["status", "kind"]);

const COL_KEYS = [...ROUTE_LIST_TOGGLEABLE_COL_KEYS];

/** @type {Record<RouteListToggleableColKey, string>} */
export const ROUTE_LIST_COL_I18N_KEYS = {
  status: "routeList.colStatus",
  kind: "routeList.colKind",
};

export function defaultRouteListColumns() {
  return {
    kind: true,
    status: true,
  };
}

export function loadRouteListColumns() {
  const defaults = defaultRouteListColumns();
  try {
    const raw = localStorage.getItem(ROUTE_LIST_COLS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;
    const out = { ...defaults };
    for (const k of COL_KEYS) {
      if (typeof parsed[k] === "boolean") out[k] = parsed[k];
    }
    return out;
  } catch {
    return defaults;
  }
}

export function saveRouteListColumns(cols) {
  const payload = {};
  for (const k of COL_KEYS) {
    if (typeof cols[k] === "boolean") payload[k] = cols[k];
  }
  try {
    localStorage.setItem(ROUTE_LIST_COLS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Restore default column visibility (all toggleable columns on). */
export function resetRouteListColumns() {
  const defaults = defaultRouteListColumns();
  saveRouteListColumns(defaults);
  return defaults;
}

/**
 * @param {ReturnType<typeof defaultRouteListColumns>} columnVisibility
 */
export function resolveRouteListColumns(columnVisibility) {
  return columnVisibility;
}

/**
 * @param {boolean} showRouteActions
 * @param {ReturnType<typeof defaultRouteListColumns>} cols
 */
export function buildRouteListGridTemplate(showRouteActions, cols) {
  const parts = ["22px", "minmax(0, 1fr)"];
  const badgeCol = "var(--route-badge-width)";

  if (cols.status) parts.push(badgeCol);
  if (cols.kind) parts.push(badgeCol);
  if (showRouteActions) parts.push("max-content");
  return parts.join(" ");
}
