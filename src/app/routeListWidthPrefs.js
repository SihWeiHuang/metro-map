const ROUTE_LIST_WIDTH_STORAGE_KEY = "metro-route-list-width";
const ROUTE_LIST_MIN_PX = 200;

export function routeListMaxPx() {
  return Math.min(720, Math.floor(window.innerWidth * 0.55));
}

export function readStoredRouteListWidth() {
  try {
    const v = localStorage.getItem(ROUTE_LIST_WIDTH_STORAGE_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) {
        return Math.min(routeListMaxPx(), Math.max(ROUTE_LIST_MIN_PX, n));
      }
    }
  } catch (_) {}
  return Math.min(320, routeListMaxPx());
}

export { ROUTE_LIST_WIDTH_STORAGE_KEY, ROUTE_LIST_MIN_PX };
