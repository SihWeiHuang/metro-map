/**
 * Authoritative in-memory route/store state.
 * Mutations stay in routeModel services; readers use routeQueries where possible.
 */
import { createEmptyLayers } from "./storeLayers.js";

/** @returns {import('./metroStoreTypes.js').MetroStore} */
export function createMetroStore() {
  return {
    layers: createEmptyLayers(),
    subroutesFC: { type: "FeatureCollection", features: [] },
    stationsFC: { type: "FeatureCollection", features: [] },
    temp: {
      editingSessions: [],
      previewStations: [],
      queuedStations: [],
      subrouteIdEditing: null,
      editHiddenSubrouteIds: new Set(),
      /** Subroutes hidden only for the current edit session (not user list hide). */
      editSessionAddedHidden: new Set(),
    },
    hiddenSubrouteIds: new Set(),
    removedDefaultRouteIds: new Set(),
    builtinDefaultsSuppressed: false,
    counters: { subroute: 1, route: 1, station: 1 },
    settings: {
      stationMinPerRoute: 0,
    },
    shareViewActive: false,
    /** Sorted subroute_id key; updated when merged subroutes change. */
    subrouteCatalogKey: "",
  };
}

/** Singleton application store. */
export const store = createMetroStore();
