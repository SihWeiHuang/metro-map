/**
 * Map layer visibility filters for hidden subroutes.
 * Skips setFilter when hidden set + subroute catalog are unchanged (common on geometry-only edits).
 */
import { REGULAR_STATION_LAYER_FILTER, TRANSFER_STATION_LAYER_FILTER } from "../map/layers.js";
import { setLayerFilter } from "./mapEngine.js";
import { syncStationLabelRouteHoverFilters } from "../map/stationLabelCollision.js";

/** @type {string | null} */
let lastAppliedKey = null;

/** @param {typeof import('../data/metroStore.js').store} store */
function buildVisibilityStateKey(store) {
  const hidden = [...store.hiddenSubrouteIds].sort().join("\0");
  const catalog = store.subrouteCatalogKey ?? "";
  return `${hidden}\n${catalog}`;
}

/** @param {typeof import('../data/metroStore.js').store} store */
function collectSubrouteIds(store) {
  if (store.subrouteCatalogKey) {
    return store.subrouteCatalogKey.split("\0").filter(Boolean);
  }
  return store.subroutesFC.features
    .map((f) => f.properties?.subroute_id)
    .filter(Boolean);
}

/**
 * @param {string[]} subrouteIds
 * @param {Set<string>} hiddenSet
 */
function buildVisibleSubrouteIds(subrouteIds, hiddenSet) {
  if (hiddenSet.size === 0) return subrouteIds;
  return subrouteIds.filter((id) => !hiddenSet.has(id));
}

/**
 * @param {string[]} visibleSubrouteIds
 */
function buildTransferAnyVisibleExpr(visibleSubrouteIds) {
  if (visibleSubrouteIds.length === 0) return false;
  return [
    "any",
    ...visibleSubrouteIds.map((rid) => [
      "in",
      rid,
      ["coalesce", ["get", "transfer_routes"], ["literal", []]],
    ]),
  ];
}

/**
 * @param {import('./mapTypes.js').MapLike} map
 * @param {typeof import('../data/metroStore.js').store} store
 */
export function applyHiddenSubrouteVisibility(map, store) {
  if (!map) return;

  const stateKey = buildVisibilityStateKey(store);
  if (stateKey === lastAppliedKey) return;
  lastAppliedKey = stateKey;

  const hiddenSet = store.hiddenSubrouteIds;
  const hiddenIds = [...hiddenSet];
  const subrouteIds = collectSubrouteIds(store);
  const visibleSubrouteIds = buildVisibleSubrouteIds(subrouteIds, hiddenSet);

  const useHiddenPrimaryCheck = hiddenIds.length <= visibleSubrouteIds.length;
  const primaryVisibleExpr = useHiddenPrimaryCheck
    ? ["!", ["in", ["get", "subroute_id"], ["literal", hiddenIds]]]
    : ["in", ["get", "subroute_id"], ["literal", visibleSubrouteIds]];

  const transferAnyVisibleExpr = buildTransferAnyVisibleExpr(visibleSubrouteIds);
  const stationVisibleFilter = ["any", primaryVisibleExpr, transferAnyVisibleExpr];
  const regularStationVisibleFilter = ["all", REGULAR_STATION_LAYER_FILTER, stationVisibleFilter];
  const transferStationVisibleFilter = ["all", TRANSFER_STATION_LAYER_FILTER, stationVisibleFilter];

  setLayerFilter(map, "stations-circle", regularStationVisibleFilter);
  setLayerFilter(map, "transfer-stations-circle", transferStationVisibleFilter);
  setLayerFilter(map, "stations-label", stationVisibleFilter);
  setLayerFilter(map, "stations-label-move-frame", stationVisibleFilter);
  syncStationLabelRouteHoverFilters(map, stationVisibleFilter);
  setLayerFilter(map, "routes-line", ["!", ["in", ["get", "subroute_id"], ["literal", hiddenIds]]]);
}

/** Reset after map teardown or tests. */
export function resetVisibilityFilterCache() {
  lastAppliedKey = null;
}
