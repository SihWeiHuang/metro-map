/**
 * Derived display geometry + dirty tracking for incremental map refresh.
 * Default and user layers are cached separately so user-only edits skip default smooth/snap work.
 */
import {
  buildStationDisplayCollections,
  featureCollectionWithSmoothedLineStrings,
  tempLineFeaturesWithSmoothedGeometry,
} from "../map/displayLineSmoothing.js";
import { LAYER_KIND_DEFAULT, subrouteLayerKind } from "../data/storeLayers.js";
import { isUserStationFeature } from "../metro/routeStoreMutations.js";

/** @type {Set<string>} */
let dirtyUserSubrouteIds = new Set();
let fullDirty = true;

let cachedDefaultRoutesData = null;
let cachedUserRoutesData = null;
let cachedDefaultStationsDisplayFC = null;
let cachedUserStationsDisplayFC = null;
let cachedDefaultStationLabelsFC = null;
let cachedUserStationLabelsFC = null;

/** @type {null | { subroutesFC: object, stationsFC: object, smoothedRoutes: object, stationsDisplayFC: object, stationLabelsFC: object }} */
let colorPreviewDisplayCache = null;

function mergeFeatureCollections(...collections) {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((fc) => fc?.features ?? []),
  };
}

function mergedRoutesCache() {
  return mergeFeatureCollections(cachedDefaultRoutesData, cachedUserRoutesData);
}

function mergedStationsDisplayCache() {
  return mergeFeatureCollections(cachedDefaultStationsDisplayFC, cachedUserStationsDisplayFC);
}

function mergedStationLabelsCache() {
  return mergeFeatureCollections(cachedDefaultStationLabelsFC, cachedUserStationLabelsFC);
}

function hasLayerCaches() {
  return (
    cachedDefaultRoutesData &&
    cachedUserRoutesData &&
    cachedDefaultStationsDisplayFC &&
    cachedUserStationsDisplayFC &&
    cachedDefaultStationLabelsFC &&
    cachedUserStationLabelsFC
  );
}

function clearLayerCaches() {
  cachedDefaultRoutesData = null;
  cachedUserRoutesData = null;
  cachedDefaultStationsDisplayFC = null;
  cachedUserStationsDisplayFC = null;
  cachedDefaultStationLabelsFC = null;
  cachedUserStationLabelsFC = null;
}

export function markDisplayFullDirty() {
  fullDirty = true;
  dirtyUserSubrouteIds.clear();
  clearLayerCaches();
}

/** @param {string | string[]} subrouteIds @param {typeof import('../data/metroStore.js').store} [store] */
export function markDisplayDirty(subrouteIds, store) {
  const ids = Array.isArray(subrouteIds) ? subrouteIds : [subrouteIds];
  if (fullDirty) return;
  for (const id of ids) {
    if (typeof id !== "string" || !id) continue;
    if (store && subrouteLayerKind(store, id) === LAYER_KIND_DEFAULT) {
      markDisplayFullDirty();
      return;
    }
    dirtyUserSubrouteIds.add(id);
  }
  if (dirtyUserSubrouteIds.size === 0) fullDirty = true;
}

export function clearColorPreviewCache() {
  colorPreviewDisplayCache = null;
}

function syncColorPreviewCacheFromStore(store) {
  if (!colorPreviewDisplayCache) return;
  const subrouteColor = new Map(
    store.subroutesFC.features.map((f) => [f.properties.subroute_id, f.properties.color]),
  );
  const stationColor = new Map(
    store.stationsFC.features.map((f) => [f.properties.station_id, f.properties.color]),
  );
  for (const f of colorPreviewDisplayCache.smoothedRoutes.features) {
    const id = f.properties?.subroute_id;
    if (id != null && subrouteColor.has(id)) f.properties.color = subrouteColor.get(id);
  }
  for (const f of colorPreviewDisplayCache.stationsDisplayFC.features) {
    const id = f.properties?.station_id;
    if (id != null && stationColor.has(id)) f.properties.color = stationColor.get(id);
  }
  for (const f of colorPreviewDisplayCache.stationLabelsFC.features) {
    const id = f.properties?.station_id;
    if (id != null && stationColor.has(id)) f.properties.color = stationColor.get(id);
  }
}

function buildLayerDisplay(subroutesFC, stationsFC, allSubroutesFC) {
  const routesData = featureCollectionWithSmoothedLineStrings(subroutesFC);
  const built = buildStationDisplayCollections(stationsFC, allSubroutesFC);
  return {
    routesData,
    stationsDisplayFC: built.stationsDisplayFC,
    stationLabelsFC: built.stationLabelsFC,
  };
}

function buildFullDisplay(store) {
  const defaultBuilt = buildLayerDisplay(
    store.layers.default.subroutesFC,
    store.layers.default.stationsFC,
    store.subroutesFC,
  );
  const userBuilt = buildLayerDisplay(
    store.layers.user.subroutesFC,
    store.layers.user.stationsFC,
    store.subroutesFC,
  );

  cachedDefaultRoutesData = defaultBuilt.routesData;
  cachedUserRoutesData = userBuilt.routesData;
  cachedDefaultStationsDisplayFC = defaultBuilt.stationsDisplayFC;
  cachedUserStationsDisplayFC = userBuilt.stationsDisplayFC;
  cachedDefaultStationLabelsFC = defaultBuilt.stationLabelsFC;
  cachedUserStationLabelsFC = userBuilt.stationLabelsFC;

  fullDirty = false;
  dirtyUserSubrouteIds.clear();

  return {
    routesData: mergedRoutesCache(),
    stationsDisplayFC: mergedStationsDisplayCache(),
    stationLabelsFC: mergedStationLabelsCache(),
  };
}

function stationAffectedByDirtyRoutes(st, dirtyIds) {
  if (dirtyIds.has(st.properties?.subroute_id)) return true;
  const transfers = st.properties?.transfer_routes;
  if (!Array.isArray(transfers)) return false;
  return transfers.some((rid) => dirtyIds.has(rid));
}

function stationDisplayCacheMatchesStore(store) {
  if (!hasLayerCaches()) return false;
  const storeIds = new Set(
    store.stationsFC.features.map((f) => f.properties?.station_id).filter(Boolean),
  );
  const displayIds = new Set(
    mergedStationsDisplayCache()
      .features.map((f) => f.properties?.station_id)
      .filter(Boolean),
  );
  if (storeIds.size !== displayIds.size) return false;
  for (const id of storeIds) {
    if (!displayIds.has(id)) return false;
  }
  return true;
}

function routeDisplayCacheMatchesStore(store) {
  if (!hasLayerCaches()) return false;
  const colorBySubrouteId = new Map(
    store.subroutesFC.features.map((f) => [f.properties?.subroute_id, f.properties?.color]),
  );
  for (const feature of mergedRoutesCache().features) {
    const subrouteId = feature.properties?.subroute_id;
    if (!subrouteId) continue;
    if (colorBySubrouteId.get(subrouteId) !== feature.properties?.color) return false;
  }
  return true;
}

function stationColorCacheMatchesStore(store) {
  if (!hasLayerCaches()) return false;
  const colorByStationId = new Map(
    store.stationsFC.features.map((f) => [f.properties?.station_id, f.properties?.color]),
  );
  for (const feature of mergedStationsDisplayCache().features) {
    const stationId = feature.properties?.station_id;
    if (!stationId) continue;
    if (colorByStationId.get(stationId) !== feature.properties?.color) return false;
  }
  for (const feature of mergedStationLabelsCache().features) {
    const stationId = feature.properties?.station_id;
    if (!stationId) continue;
    if (colorByStationId.get(stationId) !== feature.properties?.color) return false;
  }
  return true;
}

function patchStationLayerCache(layerCache, labelCache, affectedStations, allSubroutesFC) {
  if (affectedStations.length === 0) return { displayFC: layerCache, labelsFC: labelCache };

  const partialBuilt = buildStationDisplayCollections(
    { type: "FeatureCollection", features: affectedStations },
    allSubroutesFC,
  );
  const displayByStationId = new Map(
    partialBuilt.stationsDisplayFC.features.map((f) => [f.properties?.station_id, f]),
  );
  const labelByStationId = new Map(
    partialBuilt.stationLabelsFC.features.map((f) => [f.properties?.station_id, f]),
  );

  const storeStationIds = new Set(affectedStations.map((f) => f.properties?.station_id).filter(Boolean));
  let nextDisplay = {
    type: "FeatureCollection",
    features: layerCache.features
      .filter((f) => !storeStationIds.has(f.properties?.station_id))
      .map((f) => displayByStationId.get(f.properties?.station_id) ?? f),
  };
  let nextLabels = {
    type: "FeatureCollection",
    features: labelCache.features
      .filter((f) => !storeStationIds.has(f.properties?.station_id))
      .map((f) => labelByStationId.get(f.properties?.station_id) ?? f),
  };

  const cachedDisplayIds = new Set(
    nextDisplay.features.map((f) => f.properties?.station_id).filter(Boolean),
  );
  const missingStations = affectedStations.filter((st) => !cachedDisplayIds.has(st.properties?.station_id));
  if (missingStations.length > 0) {
    const added = buildStationDisplayCollections(
      { type: "FeatureCollection", features: missingStations },
      allSubroutesFC,
    );
    nextDisplay = {
      type: "FeatureCollection",
      features: [...nextDisplay.features, ...added.stationsDisplayFC.features],
    };
    nextLabels = {
      type: "FeatureCollection",
      features: [...nextLabels.features, ...added.stationLabelsFC.features],
    };
  }

  return { displayFC: nextDisplay, labelsFC: nextLabels };
}

function patchRouteLayerCache(layerCache, dirtyRoutes) {
  const partialSmoothed = featureCollectionWithSmoothedLineStrings({
    type: "FeatureCollection",
    features: dirtyRoutes,
  });
  const smoothedById = new Map(
    partialSmoothed.features.map((f) => [f.properties?.subroute_id, f]),
  );
  return {
    type: "FeatureCollection",
    features: layerCache.features.map((f) => {
      const id = f.properties?.subroute_id;
      return smoothedById.has(id) ? smoothedById.get(id) : f;
    }),
  };
}

function buildPartialDisplay(store) {
  if (!hasLayerCaches()) {
    return buildFullDisplay(store);
  }

  const dirtyIds = new Set(dirtyUserSubrouteIds);
  const dirtyUserRoutes = store.layers.user.subroutesFC.features.filter((f) =>
    dirtyIds.has(f.properties?.subroute_id),
  );

  if (dirtyUserRoutes.length === 0) {
    if (
      !stationDisplayCacheMatchesStore(store) ||
      !routeDisplayCacheMatchesStore(store) ||
      !stationColorCacheMatchesStore(store)
    ) {
      return buildFullDisplay(store);
    }
    return {
      routesData: mergedRoutesCache(),
      stationsDisplayFC: mergedStationsDisplayCache(),
      stationLabelsFC: mergedStationLabelsCache(),
      partial: false,
    };
  }

  cachedUserRoutesData = patchRouteLayerCache(cachedUserRoutesData, dirtyUserRoutes);

  const affectedStations = store.stationsFC.features.filter((st) => stationAffectedByDirtyRoutes(st, dirtyIds));
  const affectedDefault = affectedStations.filter((st) => !isUserStationFeature(st));
  const affectedUser = affectedStations.filter((st) => isUserStationFeature(st));

  if (affectedDefault.length > 0) {
    const patched = patchStationLayerCache(
      cachedDefaultStationsDisplayFC,
      cachedDefaultStationLabelsFC,
      affectedDefault,
      store.subroutesFC,
    );
    cachedDefaultStationsDisplayFC = patched.displayFC;
    cachedDefaultStationLabelsFC = patched.labelsFC;
  }
  if (affectedUser.length > 0) {
    const patched = patchStationLayerCache(
      cachedUserStationsDisplayFC,
      cachedUserStationLabelsFC,
      affectedUser,
      store.subroutesFC,
    );
    cachedUserStationsDisplayFC = patched.displayFC;
    cachedUserStationLabelsFC = patched.labelsFC;
  } else if (!stationDisplayCacheMatchesStore(store)) {
    return buildFullDisplay(store);
  }

  dirtyUserSubrouteIds.clear();
  return {
    routesData: mergedRoutesCache(),
    stationsDisplayFC: mergedStationsDisplayCache(),
    stationLabelsFC: mergedStationLabelsCache(),
    partial: true,
  };
}

/**
 * @param {typeof import('../data/metroStore.js').store} store
 * @param {{ preview?: boolean }} [options]
 */
export function buildRouteDisplayPayload(store, options = {}) {
  const preview = options.preview === true;

  if (preview) {
    if (
      colorPreviewDisplayCache &&
      colorPreviewDisplayCache.subroutesFC === store.subroutesFC &&
      colorPreviewDisplayCache.stationsFC === store.stationsFC
    ) {
      syncColorPreviewCacheFromStore(store);
      return {
        routesData: colorPreviewDisplayCache.smoothedRoutes,
        stationsDisplayFC: colorPreviewDisplayCache.stationsDisplayFC,
        stationLabelsFC: colorPreviewDisplayCache.stationLabelsFC,
        preview: true,
      };
    }
    const routesData = featureCollectionWithSmoothedLineStrings(store.subroutesFC);
    const built = buildStationDisplayCollections(store.stationsFC, store.subroutesFC);
    colorPreviewDisplayCache = {
      subroutesFC: store.subroutesFC,
      stationsFC: store.stationsFC,
      smoothedRoutes: routesData,
      stationsDisplayFC: built.stationsDisplayFC,
      stationLabelsFC: built.stationLabelsFC,
    };
    return {
      routesData,
      stationsDisplayFC: built.stationsDisplayFC,
      stationLabelsFC: built.stationLabelsFC,
      preview: true,
    };
  }

  colorPreviewDisplayCache = null;

  if (fullDirty) {
    return { ...buildFullDisplay(store), partial: false, preview: false };
  }
  return { ...buildPartialDisplay(store), preview: false };
}

/** @param {typeof import('../data/metroStore.js').store} store */
export function buildTempEditFeatureCollections(store) {
  const tempLines = [];
  const tempNodes = [];

  store.temp.editingSessions.forEach((session) => {
    if (session.nodes.length >= 2) {
      tempLines.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: session.nodes },
        properties: { subroute_id: session.subrouteId },
      });
    }
    session.nodes.forEach((c, i) => {
      tempNodes.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: c },
        properties: { idx: i, subroute_id: session.subrouteId },
      });
    });
  });

  return {
    tempLineFC: {
      type: "FeatureCollection",
      features: tempLineFeaturesWithSmoothedGeometry(tempLines),
    },
    tempNodesFC: { type: "FeatureCollection", features: tempNodes },
  };
}

export function invalidateDisplayCache() {
  markDisplayFullDirty();
}
