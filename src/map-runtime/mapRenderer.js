/**
 * Sole writer to Mapbox GeoJSON sources and route visibility filters.
 */
import { setGeoJsonSourceData } from "./mapAdapter.js";
import {
  buildRouteDisplayPayload,
  buildTempEditFeatureCollections,
  clearColorPreviewCache,
  markDisplayFullDirty,
} from "./displayModel.js";
import { applyHiddenSubrouteVisibility as applyHiddenSubrouteVisibilityFilters } from "./visibilityFilters.js";

/** @param {import('./mapTypes.js').MapLike | null | undefined} map */
function setSourceData(map, sourceId, data) {
  if (!map || !data) return;
  setGeoJsonSourceData(map, sourceId, data);
}

/** @param {import('./mapTypes.js').MapLike} map @param {typeof import('../data/metroStore.js').store} store */
export function applyHiddenSubrouteVisibility(map, store) {
  applyHiddenSubrouteVisibilityFilters(map, store);
}

/**
 * Full map source sync (init, import, share, reset).
 * @param {import('./mapTypes.js').MapLike | null | undefined} map
 * @param {typeof import('../data/metroStore.js').store} store
 * @param {{ preview?: boolean, visibilityOnly?: boolean }} [options]
 */
export function fullSync(map, store, options = {}) {
  if (!map) return;

  if (options.visibilityOnly) {
    applyHiddenSubrouteVisibility(map, store);
    return;
  }

  if (!options.preview) {
    clearColorPreviewCache();
    markDisplayFullDirty();
  }

  const payload = buildRouteDisplayPayload(store, options);
  setSourceData(map, "routes", payload.routesData);
  setSourceData(map, "stations", payload.stationsDisplayFC);
  setSourceData(map, "station-labels", payload.stationLabelsFC);

  const { tempLineFC, tempNodesFC } = buildTempEditFeatureCollections(store);
  setSourceData(map, "temp-edit-line", tempLineFC);
  setSourceData(map, "temp-edit-nodes", tempNodesFC);

  applyHiddenSubrouteVisibility(map, store);
}

/**
 * Incremental sync using displayModel dirty set.
 * @param {import('./mapTypes.js').MapLike | null | undefined} map
 * @param {typeof import('../data/metroStore.js').store} store
 * @param {{ preview?: boolean }} [options]
 */
export function applyDirty(map, store, options = {}) {
  if (!map) return;
  if (!options.preview) clearColorPreviewCache();
  const payload = buildRouteDisplayPayload(store, options);
  setSourceData(map, "routes", payload.routesData);
  setSourceData(map, "stations", payload.stationsDisplayFC);
  setSourceData(map, "station-labels", payload.stationLabelsFC);
  if (!options.preview) {
    const { tempLineFC, tempNodesFC } = buildTempEditFeatureCollections(store);
    setSourceData(map, "temp-edit-line", tempLineFC);
    setSourceData(map, "temp-edit-nodes", tempNodesFC);
    applyHiddenSubrouteVisibility(map, store);
  }
}

/** Temp-edit layers only (route vertex drag). */
export function tempSync(map, store) {
  if (!map) return;
  const { tempLineFC, tempNodesFC } = buildTempEditFeatureCollections(store);
  setSourceData(map, "temp-edit-line", tempLineFC);
  setSourceData(map, "temp-edit-nodes", tempNodesFC);
}

/** Station circles + labels only. */
export function stationDisplaySync(map, store) {
  if (!map) return;
  clearColorPreviewCache();
  markDisplayFullDirty();
  const payload = buildRouteDisplayPayload(store, { preview: false });
  setSourceData(map, "stations", payload.stationsDisplayFC);
  setSourceData(map, "station-labels", payload.stationLabelsFC);
}

export function visibilitySync(map, store) {
  applyHiddenSubrouteVisibility(map, store);
}
