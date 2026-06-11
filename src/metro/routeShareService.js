/**
 * Share view session overlay (read-only map preview).
 */
import { store } from "../data/metroStore.js";
import { schedulePersistToStorage } from "./persistenceAdapter.js";
import { refreshSources } from "./routeRenderCommands.js";
import {
  captureUserStateSnapshot,
  importUserStateJSON,
  parseImportPayload,
  restoreUserStateSnapshot,
} from "./routeImportService.js";
import {
  clearUserContent,
  extractUserStationsByRoutes,
  mergeUserStateIntoStore,
  normalizeAllSubroutesMetadata,
  normalizeUserDefaultNames,
  routeKindOf,
  syncCountersFromLoadedFeatures,
} from "./routeStoreMutations.js";
import { computeMapViewFromFeatures } from "../map/mapGeoBounds.js";
import { scheduleImportMapView } from "../map/mapViewState.js";
import { setShareViewState } from "./shareViewBoundary.js";
import { ROUTE_KIND_USER } from "../data/routeConstants.js";

/** @type {{ restoreSnapshot: import('./routeStoreMutations.js').UserStateSnapshot, payloadText: string, expiresAt: string | null } | null} */
let shareViewSession = null;

function abandonShareViewWithoutRestore() {
  shareViewSession = null;
  store.shareViewActive = false;
  setShareViewState(false, null);
}

export function openShareView(jsonString, meta = {}) {
  if (shareViewSession) {
    restoreUserStateSnapshot(shareViewSession.restoreSnapshot);
    shareViewSession = null;
  }
  let mapView = null;
  try {
    const data = JSON.parse(jsonString);
    const { userSubroutes, userStations, hiddenSubrouteIds, mapView: mv } = parseImportPayload(data);
    mapView = mv;
    shareViewSession = {
      restoreSnapshot: captureUserStateSnapshot(),
      payloadText: jsonString,
      expiresAt: meta.expiresAt ?? null,
    };
    store.shareViewActive = true;
    setShareViewState(true, meta.expiresAt ?? null);
    clearUserContent();
    mergeUserStateIntoStore(userSubroutes, userStations);
    if (Array.isArray(hiddenSubrouteIds)) {
      for (const rid of hiddenSubrouteIds) {
        if (typeof rid === "string") store.hiddenSubrouteIds.add(rid);
      }
    }
    store.settings.stationMinPerRoute = 0;
    syncCountersFromLoadedFeatures();
    normalizeAllSubroutesMetadata();
    normalizeUserDefaultNames();
    refreshSources({ full: true });
    scheduleImportMapView(mapView);
    return { ok: true, mapView, subRouteCount: userSubroutes.length, stationCount: userStations.length };
  } catch (e) {
    store.shareViewActive = false;
    shareViewSession = null;
    setShareViewState(false, null);
    const code = e instanceof Error && e.message ? e.message : "import_failed";
    return { ok: false, error: code };
  }
}

export function exitShareView() {
  if (!shareViewSession) return { ok: false };
  restoreUserStateSnapshot(shareViewSession.restoreSnapshot);
  store.shareViewActive = false;
  shareViewSession = null;
  setShareViewState(false, null);
  refreshSources({ full: true });
  const userSubroutes = store.subroutesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
  const userSubrouteIds = new Set(userSubroutes.map((f) => f.properties?.subroute_id).filter((id) => typeof id === "string"));
  const userStations = extractUserStationsByRoutes(store.stationsFC.features, userSubrouteIds);
  scheduleImportMapView(computeMapViewFromFeatures(userSubroutes, userStations));
  schedulePersistToStorage();
  return { ok: true };
}

export function adoptShareToMyMap() {
  if (!shareViewSession) return { ok: false, error: "no_share_view" };
  const text = shareViewSession.payloadText;
  const restoreSnapshot = shareViewSession.restoreSnapshot;
  store.shareViewActive = false;
  shareViewSession = null;
  setShareViewState(false, null);
  restoreUserStateSnapshot(restoreSnapshot);
  return importUserStateJSON(text, { mode: "merge" });
}

export function isShareViewActive() {
  return store.shareViewActive;
}

export function getShareViewExpiresAt() {
  return shareViewSession?.expiresAt ?? null;
}