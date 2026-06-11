/**
 * Default / user layer partition for metroStore.
 * Merged `subroutesFC` / `stationsFC` remain the CRUD-facing view; layers stay in sync via sync helpers.
 */
import { ROUTE_KIND_DEFAULT, ROUTE_KIND_USER } from "./routeConstants.js";
import { routeKindOf } from "../metro/routeStoreMutations.js";

export const LAYER_KIND_DEFAULT = "default";
export const LAYER_KIND_USER = "user";

export function emptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

export function createEmptyLayers() {
  return {
    default: {
      subroutesFC: emptyFeatureCollection(),
      stationsFC: emptyFeatureCollection(),
    },
    user: {
      subroutesFC: emptyFeatureCollection(),
      stationsFC: emptyFeatureCollection(),
    },
  };
}

function buildSubrouteCatalogKey(store) {
  return store.subroutesFC.features
    .map((f) => f.properties?.subroute_id)
    .filter(Boolean)
    .sort()
    .join("\0");
}

/** @param {typeof import('./metroStore.js').store} store */
export function syncMergedFromLayers(store) {
  store.subroutesFC = {
    type: "FeatureCollection",
    features: [
      ...store.layers.default.subroutesFC.features,
      ...store.layers.user.subroutesFC.features,
    ],
  };
  store.stationsFC = {
    type: "FeatureCollection",
    features: [
      ...store.layers.default.stationsFC.features,
      ...store.layers.user.stationsFC.features,
    ],
  };
  store.subrouteCatalogKey = buildSubrouteCatalogKey(store);
}

function subrouteKindById(store) {
  const map = new Map();
  for (const f of store.subroutesFC.features) {
    const id = f.properties?.subroute_id;
    if (typeof id === "string" && id) map.set(id, routeKindOf(f));
  }
  return map;
}

function stationLayerKind(station, kindBySubrouteId) {
  const rid = station?.properties?.subroute_id;
  if (typeof rid === "string" && kindBySubrouteId.get(rid) === ROUTE_KIND_USER) {
    return LAYER_KIND_USER;
  }
  const transfers = station?.properties?.transfer_routes;
  if (Array.isArray(transfers)) {
    for (const tr of transfers) {
      if (kindBySubrouteId.get(tr) === ROUTE_KIND_USER) return LAYER_KIND_USER;
    }
  }
  return LAYER_KIND_DEFAULT;
}

/**
 * Re-split merged FCs into default / user layers (after CRUD writes to merged view).
 * @param {typeof import('./metroStore.js').store} store
 */
export function splitMergedIntoLayers(store) {
  const defaultSub = [];
  const userSub = [];
  for (const f of store.subroutesFC.features) {
    (routeKindOf(f) === ROUTE_KIND_DEFAULT ? defaultSub : userSub).push(f);
  }
  store.layers.default.subroutesFC.features = defaultSub;
  store.layers.user.subroutesFC.features = userSub;

  const kindById = subrouteKindById(store);
  const defaultSt = [];
  const userSt = [];
  for (const s of store.stationsFC.features) {
    (stationLayerKind(s, kindById) === LAYER_KIND_USER ? userSt : defaultSt).push(s);
  }
  store.layers.default.stationsFC.features = defaultSt;
  store.layers.user.stationsFC.features = userSt;
  store.subrouteCatalogKey = buildSubrouteCatalogKey(store);
}

/** @param {typeof import('./metroStore.js').store} store @param {string} subrouteId */
export function subrouteLayerKind(store, subrouteId) {
  const f = store.subroutesFC.features.find((x) => x.properties?.subroute_id === subrouteId);
  if (!f) return LAYER_KIND_USER;
  return routeKindOf(f) === ROUTE_KIND_DEFAULT ? LAYER_KIND_DEFAULT : LAYER_KIND_USER;
}

/** @param {typeof import('./metroStore.js').store} store */
export function clearUserLayer(store) {
  store.layers.user.subroutesFC = emptyFeatureCollection();
  store.layers.user.stationsFC = emptyFeatureCollection();
  syncMergedFromLayers(store);
}

/** @param {typeof import('./metroStore.js').store} store */
export function clearDefaultLayer(store) {
  store.layers.default.subroutesFC = emptyFeatureCollection();
  store.layers.default.stationsFC = emptyFeatureCollection();
  syncMergedFromLayers(store);
}
