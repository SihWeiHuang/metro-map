/** Persisted visibility for route list table columns (header + cells). */

export const ROUTE_LIST_COLS_STORAGE_KEY = "metro-map-route-list-columns-v1";

const COL_KEYS = ["kind", "actions"];

export function defaultRouteListColumns() {
  return {
    kind: true,
    actions: true,
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
  try {
    localStorage.setItem(ROUTE_LIST_COLS_STORAGE_KEY, JSON.stringify(cols));
  } catch {
    /* ignore */
  }
}

/**
 * @param {boolean} showRouteActions
 * @param {ReturnType<typeof defaultRouteListColumns>} cols
 */
export function buildRouteListGridTemplate(showRouteActions, cols) {
  const parts = ["22px", "minmax(0, 1fr)"];
  if (cols.kind) parts.push("64px");
  if (showRouteActions && cols.actions) parts.push("minmax(160px, 230px)");
  return parts.join(" ");
}
