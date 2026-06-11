import { store } from "../data/metroStore.js";
import { PERSIST_STORAGE_KEY, PERSIST_VERSION } from "../data/routeConstants.js";
import { onMetroEvent } from "./metroEvents.js";

let persistTimer = null;

function extractUserStationsByRoutes(stationFeatures, userSubrouteIds) {
  return stationFeatures.filter((f) => {
    if (userSubrouteIds.has(f.properties?.subroute_id)) return true;
    const transfers = f.properties?.transfer_routes;
    if (!Array.isArray(transfers)) return false;
    return transfers.some((rid) => userSubrouteIds.has(rid));
  });
}

export function writePersistPayloadToStorage() {
  if (store.shareViewActive) return;
  if (typeof localStorage === "undefined") return;
  try {
    const userSubroutes = store.layers.user.subroutesFC.features;
    const userSubrouteIds = new Set(userSubroutes.map((f) => f.properties?.subroute_id));
    const userStations = store.layers.user.stationsFC.features.length
      ? store.layers.user.stationsFC.features
      : extractUserStationsByRoutes(store.stationsFC.features, userSubrouteIds);
    const payload = {
      v: PERSIST_VERSION,
      userSubroutesFC: { type: "FeatureCollection", features: userSubroutes },
      userStationsFC: { type: "FeatureCollection", features: userStations },
      hiddenSubrouteIds: Array.from(store.hiddenSubrouteIds),
      removedDefaultRouteIds: Array.from(store.removedDefaultRouteIds),
      builtinDefaultsSuppressed: store.builtinDefaultsSuppressed,
      counters: { ...store.counters },
      settings: { ...store.settings },
    };
    localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("metro-multiverse: could not save map data", e);
  }
}

export function flushPersistToStorage() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  writePersistPayloadToStorage();
}

export function schedulePersistToStorage() {
  if (store.shareViewActive) return;
  if (typeof localStorage === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writePersistPayloadToStorage();
  }, 200);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => flushPersistToStorage());
}

onMetroEvent("store:persist", () => schedulePersistToStorage());
