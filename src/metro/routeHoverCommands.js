/**
 * Route/station hover highlight filters (Mapbox layer filters only).
 */
import { store } from "../data/metroStore.js";
import { getMap } from "../map/mapInstance.js";
import { applyStationHoverVisuals } from "../map/mapHoverFilters.js";
import { applyStationLabelCollisionForRouteHover } from "../map/stationLabelCollision.js";
import { hasLayer, setLayerFilter } from "../map-runtime/mapEngine.js";

/** @param {import('../map-runtime/mapTypes.js').MapLike} map @param {string} layerId @param {string[]} ids @param {string[]} hiddenIds */
function setRouteHoverLayerFilter(map, layerId, ids, hiddenIds) {
  if (!hasLayer(map, layerId)) return;
  if (!ids.length) {
    setLayerFilter(map, layerId, ["==", ["get", "subroute_id"], ""]);
  } else {
    setLayerFilter(map, layerId, [
      "all",
      ["in", ["get", "subroute_id"], ["literal", ids]],
      ["!", ["in", ["get", "subroute_id"], ["literal", hiddenIds]]],
    ]);
  }
}

/** 將子路線 id 擴展為同一路線（route_id）下的全部子路線。 */
function expandSubrouteIdsToRouteGroups(subrouteIds) {
  const expanded = new Set();
  for (const id of subrouteIds) {
    if (typeof id !== "string" || id === "") continue;
    const route = store.subroutesFC.features.find((f) => f.properties.subroute_id === id);
    const routeId = route?.properties?.route_id;
    if (routeId) {
      for (const f of store.subroutesFC.features) {
        if (f.properties.route_id === routeId) expanded.add(f.properties.subroute_id);
      }
    } else {
      expanded.add(id);
    }
  }
  return [...expanded];
}

function applyRouteHoverHighlightFilters(visibleSubrouteIds) {
  const map = getMap();
  if (!map) return;
  const hiddenIds = Array.from(store.hiddenSubrouteIds);
  const ids = expandSubrouteIdsToRouteGroups(visibleSubrouteIds).filter((rid) => !store.hiddenSubrouteIds.has(rid));

  setRouteHoverLayerFilter(map, "routes-line-hover-casing", ids, hiddenIds);
  setRouteHoverLayerFilter(map, "routes-line-hover", ids, hiddenIds);

  applyStationLabelCollisionForRouteHover(map, ids);
  applyStationHoverVisuals(map, { subrouteIds: ids });
}

export function highlightRoute(subrouteId) {
  applyRouteHoverHighlightFilters(typeof subrouteId === "string" && subrouteId !== "" ? [subrouteId] : []);
}

export function highlightPassingSubroutes(subrouteIds) {
  const ids = Array.isArray(subrouteIds) ? subrouteIds.filter((id) => typeof id === "string" && id !== "") : [];
  applyRouteHoverHighlightFilters(ids);
}

export function clearHover() {
  applyRouteHoverHighlightFilters([]);
}
