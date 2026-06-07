/**
 * Third-layer route table filters (RouteListPanel only).
 *
 * Geo scope (country / city) is chosen in RouteListNavigator layers 1–2.
 * This module filters the already-scoped `routes` prop by status and kind.
 */
import { Route } from "../map/routeModel.js";

export const ROUTE_LIST_FILTER_STORAGE_KEY = "metro-map-route-list-filter-v1";

/** @typedef {"all" | "operating" | "planning" | "construction" | "custom"} RouteListStatusFilter */
/** @typedef {"all" | "default" | "user"} RouteListKindFilter */

export const ROUTE_LIST_STATUS_FILTER_VALUES = /** @type {const} */ ([
  "all",
  "operating",
  "planning",
  "construction",
  "custom",
]);

export const ROUTE_LIST_KIND_FILTER_VALUES = /** @type {const} */ (["all", "default", "user"]);

const STATUS_FILTER_SET = new Set(ROUTE_LIST_STATUS_FILTER_VALUES);
const KIND_FILTER_SET = new Set(ROUTE_LIST_KIND_FILTER_VALUES);

/** @type {Record<Exclude<RouteListStatusFilter, "all">, string>} */
export const ROUTE_LIST_STATUS_FILTER_I18N = {
  operating: "routeStatus.operating",
  planning: "routeStatus.planning",
  construction: "routeStatus.construction",
  custom: "routeStatus.custom",
};

/** @type {Record<Exclude<RouteListKindFilter, "all">, string>} */
export const ROUTE_LIST_KIND_FILTER_I18N = {
  default: "routeList.kindDefault",
  user: "routeList.kindUser",
};

export function defaultRouteListFilter() {
  return {
    statusFilter: /** @type {RouteListStatusFilter} */ ("all"),
    kindFilter: /** @type {RouteListKindFilter} */ ("all"),
  };
}

export function loadRouteListFilter() {
  const defaults = defaultRouteListFilter();
  try {
    const raw = localStorage.getItem(ROUTE_LIST_FILTER_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;
    const statusFilter = STATUS_FILTER_SET.has(parsed.statusFilter) ? parsed.statusFilter : defaults.statusFilter;
    const kindFilter = KIND_FILTER_SET.has(parsed.kindFilter) ? parsed.kindFilter : defaults.kindFilter;
    return { statusFilter, kindFilter };
  } catch {
    return defaults;
  }
}

export function saveRouteListFilter(filter) {
  try {
    localStorage.setItem(
      ROUTE_LIST_FILTER_STORAGE_KEY,
      JSON.stringify({
        statusFilter: filter.statusFilter,
        kindFilter: filter.kindFilter,
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Restore default filters (show all statuses and kinds). */
export function resetRouteListFilter() {
  const defaults = defaultRouteListFilter();
  saveRouteListFilter(defaults);
  return defaults;
}

function normalizeRouteStatus(value) {
  if (typeof value === "string" && STATUS_FILTER_SET.has(value) && value !== "all") return value;
  return Route.ROUTE_STATUS_CUSTOM;
}

function normalizeRouteKind(value) {
  return value === Route.ROUTE_KIND_DEFAULT ? Route.ROUTE_KIND_DEFAULT : Route.ROUTE_KIND_USER;
}

/**
 * Client-side filter for the current city's route list (third layer only).
 * @param {Array<{ status?: unknown, route_kind?: unknown }>} routes
 * @param {{ statusFilter: RouteListStatusFilter, kindFilter: RouteListKindFilter }} filter
 */
export function filterRouteListEntries(routes, { statusFilter, kindFilter }) {
  return routes.filter((r) => {
    if (statusFilter !== "all" && normalizeRouteStatus(r.status) !== statusFilter) return false;
    if (kindFilter !== "all") {
      const expected = kindFilter === "default" ? Route.ROUTE_KIND_DEFAULT : Route.ROUTE_KIND_USER;
      if (normalizeRouteKind(r.route_kind) !== expected) return false;
    }
    return true;
  });
}
