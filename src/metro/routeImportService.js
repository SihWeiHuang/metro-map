/**
 * Import / export / undo commands.
 */
import { MAX_USER_ROUTES } from "../../shared/shareLimits.js";
import { assertCanAddUserRoutes, countUserRoutes } from "../data/routeQueries.js";
import {
  EXPORT_FILE_FORMAT,
  PERSIST_STORAGE_KEY,
  PERSIST_VERSION,
  ROUTE_KIND_USER,
} from "../data/routeConstants.js";
import { store } from "../data/metroStore.js";
import { setImportUndoAvailable } from "./importUndoBoundary.js";
import { cancelPendingPersistToStorage } from "./persistenceAdapter.js";
import {
  clearLastImportUndoSnapshot,
  getLastImportUndoSnapshot,
  runWithSkipImportUndoInvalidate,
  setLastImportUndoSnapshot,
} from "./routeImportUndoState.js";
import { refreshSources } from "./routeRenderCommands.js";
import {
  DISPLAY_ONLY_STATION_PROPS,
  applyRemovedDefaultRoutes,
  bumpRoutesGeometryRevision,
  clearUserContent,
  extractUserOnlyRoutes,
  extractUserStationsByRoutes,
  loadBuiltinDefaultState,
  mergeUserStateIntoStore,
  normalizeAllSubroutesMetadata,
  normalizeRouteProperties,
  normalizeUserDefaultNames,
  routeKindOf,
  syncCountersFromLoadedFeatures,
} from "./routeStoreMutations.js";
import { computeMapViewFromFeatures, normalizeImportedMapView } from "../map/mapGeoBounds.js";
import { scheduleImportMapView } from "../map/mapViewState.js";
import {
  resolveRouteDisplayNameFromProps,
} from "../map/defaultNames.js";
import { deleteRoutes } from "./routeCrudService.js";
import { cancelTempEditing } from "./routeCrudService.js";

/** @deprecated 舊版匯出檔仍允許匯入 */
const LEGACY_IMPORT_FORMATS = new Set(["metro-map-x01"]);

export { assertCanAddUserRoutes, countUserRoutes };

export function getUniqueImportRouteIds(userSubroutes) {
  const ids = new Set();
  for (const f of userSubroutes) {
    const routeId = f.properties?.route_id;
    if (typeof routeId === "string") ids.add(routeId);
  }
  return ids;
}

/**
 * Project unique user route_id count after import (line level, not sub-routes).
 * @param {typeof userSubroutes} userSubroutes
 * @param {ImportMode} mode
 * @param {string[]} [duplicateRouteIds]
 * @param {Set<string>} [duplicateDisplayNames]
 */
export function projectUserRouteCountAfterImport(
  userSubroutes,
  mode,
  duplicateRouteIds = [],
  duplicateDisplayNames = new Set()
) {
  const importIds = getUniqueImportRouteIds(userSubroutes);
  if (mode === "replaceAll") return importIds.size;

  const currentIds = getExistingUserRouteIdSet();

  if (mode === "replaceMatching") {
    const idSet = new Set(duplicateRouteIds);
    const nameSet = duplicateDisplayNames instanceof Set ? duplicateDisplayNames : new Set();
    const projected = new Set();
    const seenCurrent = new Set();
    for (const f of store.subroutesFC.features) {
      if (routeKindOf(f) !== ROUTE_KIND_USER) continue;
      const routeId = f.properties?.route_id;
      if (typeof routeId !== "string" || seenCurrent.has(routeId)) continue;
      seenCurrent.add(routeId);
      const displayName = normalizeRouteNameForDuplicateFromProps(f.properties);
      if ((displayName && nameSet.has(displayName)) || idSet.has(routeId)) continue;
      projected.add(routeId);
    }
    for (const id of importIds) projected.add(id);
    return projected.size;
  }

  const projectedIds = new Set(currentIds);
  const existingForMerge = new Set(currentIds);
  const importRouteIdMap = new Map();
  for (const f of userSubroutes) {
    const oldRouteId = f.properties?.route_id;
    if (typeof oldRouteId !== "string" || importRouteIdMap.has(oldRouteId)) continue;
    if (!existingForMerge.has(oldRouteId)) {
      importRouteIdMap.set(oldRouteId, oldRouteId);
      existingForMerge.add(oldRouteId);
      projectedIds.add(oldRouteId);
    } else {
      const phantom = `__import_new_${importRouteIdMap.size}`;
      importRouteIdMap.set(oldRouteId, phantom);
      existingForMerge.add(phantom);
      projectedIds.add(phantom);
    }
  }
  return projectedIds.size;
}

/**
 * @param {typeof userSubroutes} userSubroutes
 * @param {ImportMode} mode
 * @param {{ duplicateRouteIds?: string[], duplicateDisplayNames?: Set<string> }} [duplicateInfo]
 */
export function assertImportWithinUserRouteLimit(userSubroutes, mode, duplicateInfo = {}) {
  const projected = projectUserRouteCountAfterImport(
    userSubroutes,
    mode,
    duplicateInfo.duplicateRouteIds ?? [],
    duplicateInfo.duplicateDisplayNames
  );
  const limit = MAX_USER_ROUTES;
  const current = countUserRoutes();
  if (projected > limit) {
    return { ok: false, code: "route_limit_reached", limit, current, projected };
  }
  return { ok: true, projected };
}

/** Snapshot taken immediately before the most recent successful import. */
function notifyImportUndoListeners() {
  setImportUndoAvailable(getLastImportUndoSnapshot() != null);
}

export function captureUserStateSnapshot() {
  const userSubroutes = store.subroutesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
  const userSubrouteIds = new Set(userSubroutes.map((f) => f.properties?.subroute_id).filter((id) => typeof id === "string"));
  const userStations = extractUserStationsByRoutes(store.stationsFC.features, userSubrouteIds);
  return {
    userSubroutes: JSON.parse(JSON.stringify(userSubroutes)),
    userStations: JSON.parse(JSON.stringify(userStations)),
    hiddenSubrouteIds: Array.from(store.hiddenSubrouteIds).filter((id) => userSubrouteIds.has(id)),
    removedDefaultRouteIds: Array.from(store.removedDefaultRouteIds),
    builtinDefaultsSuppressed: store.builtinDefaultsSuppressed,
    counters: { ...store.counters },
    settings: { ...store.settings },
  };
}

export function restoreUserStateSnapshot(snapshot) {
  clearUserContent();
  if (snapshot.userSubroutes.length || snapshot.userStations.length) {
    mergeUserStateIntoStore(snapshot.userSubroutes, snapshot.userStations);
  }
  store.hiddenSubrouteIds = new Set(snapshot.hiddenSubrouteIds);
  store.removedDefaultRouteIds = new Set(
    Array.isArray(snapshot.removedDefaultRouteIds)
      ? snapshot.removedDefaultRouteIds.filter((id) => typeof id === "string" && id !== "")
      : []
  );
  store.builtinDefaultsSuppressed = snapshot.builtinDefaultsSuppressed === true;
  if (!store.builtinDefaultsSuppressed) {
    applyRemovedDefaultRoutes();
  }
  store.counters = { ...snapshot.counters };
  store.settings = { ...snapshot.settings };
  syncCountersFromLoadedFeatures();
  normalizeAllSubroutesMetadata();
}

export function canUndoLastImport() {
  return getLastImportUndoSnapshot() != null;
}

export function undoLastImport() {
  const snapshot = getLastImportUndoSnapshot();
  if (!snapshot) return { ok: false };
  clearLastImportUndoSnapshot();
  return runWithSkipImportUndoInvalidate(() => {
    restoreUserStateSnapshot(snapshot);
    refreshSources({ full: true });
    const mapView = computeMapViewFromFeatures(snapshot.userSubroutes, snapshot.userStations);
    scheduleImportMapView(mapView);
    notifyImportUndoListeners();
    return { ok: true, mapView };
  });
}

function sanitizeRouteForExport(feature) {
  const c = JSON.parse(JSON.stringify(feature));
  if (!c.properties || typeof c.properties !== "object") c.properties = {};
  normalizeRouteProperties(c.properties);
  c.properties.route_kind = ROUTE_KIND_USER;
  return c;
}

function sanitizeStationForExport(feature) {
  if (feature?.properties?.subroute_id === "__temp_preview__") return null;
  const c = JSON.parse(JSON.stringify(feature));
  if (!c.properties || typeof c.properties !== "object") c.properties = {};
  for (const key of DISPLAY_ONLY_STATION_PROPS) {
    delete c.properties[key];
  }
  delete c.properties.label_lnglat;
  delete c.properties.label_is_manual;
  return c;
}

function buildUserExportPayload(routeIds) {
  const routeIdSet = Array.isArray(routeIds) && routeIds.length > 0 ? new Set(routeIds) : null;
  let userRouteFeatures = store.subroutesFC.features.filter((f) => routeKindOf(f) === ROUTE_KIND_USER);
  if (routeIdSet) {
    userRouteFeatures = userRouteFeatures.filter((f) => routeIdSet.has(f.properties.route_id));
  }
  const userSubroutes = userRouteFeatures.map(sanitizeRouteForExport);
  const userSubrouteIds = new Set(userSubroutes.map((f) => f.properties.subroute_id));
  const userStations = extractUserStationsByRoutes(store.stationsFC.features, userSubrouteIds)
    .map(sanitizeStationForExport)
    .filter(Boolean);
  const hiddenSubrouteIds = Array.from(store.hiddenSubrouteIds).filter((id) => userSubrouteIds.has(id));
  const mapView = computeMapViewFromFeatures(userSubroutes, userStations);
  return {
    format: EXPORT_FILE_FORMAT,
    formatVersion: PERSIST_VERSION,
    exportedAt: new Date().toISOString(),
    v: PERSIST_VERSION,
    userSubroutesFC: { type: "FeatureCollection", features: userSubroutes },
    userStationsFC: { type: "FeatureCollection", features: userStations },
    hiddenSubrouteIds,
    counters: { ...store.counters },
    settings: { ...store.settings },
    ...(mapView ? { mapView } : {}),
  };
}

export function hasUserContent() {
  return store.subroutesFC.features.some((f) => routeKindOf(f) === ROUTE_KIND_USER);
}

/**
 * 清除所有使用者路線、還原內建預設路線，並清空本機路線存檔。
 * @returns {{ ok: true }}
 */
export function resetToDefaultState() {
  cancelPendingPersistToStorage();
  store.shareViewActive = false;
  cancelTempEditing();
  clearLastImportUndoSnapshot();
  notifyImportUndoListeners();

  clearUserContent();
  store.hiddenSubrouteIds.clear();
  store.removedDefaultRouteIds.clear();
  store.builtinDefaultsSuppressed = false;
  store.settings.stationMinPerRoute = 0;
  loadBuiltinDefaultState();
  bumpRoutesGeometryRevision();
  refreshSources({ full: true, skipPersist: true });

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(PERSIST_STORAGE_KEY);
      localStorage.removeItem("metro-map-data-v1");
    } catch {
      /* ignore quota / private mode */
    }
  }

  return { ok: true };
}

export function getExistingUserRouteIdSet() {
  const ids = new Set();
  for (const f of store.subroutesFC.features) {
    if (routeKindOf(f) !== ROUTE_KIND_USER) continue;
    const routeId = f.properties?.route_id;
    if (typeof routeId === "string") ids.add(routeId);
  }
  return ids;
}

export function normalizeRouteNameForDuplicate(name) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
}

export function normalizeRouteNameForDuplicateFromProps(props) {
  return normalizeRouteNameForDuplicate(resolveRouteDisplayNameFromProps(props));
}

export function getExistingUserRouteNameSet() {
  const names = new Set();
  const seenRouteIds = new Set();
  for (const f of store.subroutesFC.features) {
    if (routeKindOf(f) !== ROUTE_KIND_USER) continue;
    const routeId = f.properties?.route_id;
    if (typeof routeId !== "string" || seenRouteIds.has(routeId)) continue;
    seenRouteIds.add(routeId);
    const name = normalizeRouteNameForDuplicateFromProps(f.properties);
    if (name) names.add(name);
  }
  return names;
}

/**
 * Detect import lines that collide with existing user lines (by display name or route_id).
 * @returns {{ duplicateRouteIds: string[], duplicateDisplayNames: Set<string> }}
 */
export function collectImportDuplicateMatchInfo(userSubroutes) {
  const existingNames = getExistingUserRouteNameSet();
  const existingIds = getExistingUserRouteIdSet();
  const duplicateRouteIds = [];
  const duplicateDisplayNames = new Set();
  const seenImportRouteIds = new Set();

  for (const f of userSubroutes) {
    const props = f.properties;
    if (!props) continue;
    const routeId = props.route_id;
    if (typeof routeId !== "string" || seenImportRouteIds.has(routeId)) continue;
    seenImportRouteIds.add(routeId);
    const displayName = normalizeRouteNameForDuplicateFromProps(props);
    const isDuplicate = displayName ? existingNames.has(displayName) : existingIds.has(routeId);
    if (!isDuplicate) continue;
    duplicateRouteIds.push(routeId);
    if (displayName) duplicateDisplayNames.add(displayName);
  }

  duplicateRouteIds.sort((a, b) => a.localeCompare(b, "en"));
  return { duplicateRouteIds, duplicateDisplayNames };
}

/** Import `route_id` values whose display name, or fallback id, already exists. */
export function getImportDuplicateRouteIds(userSubroutes) {
  return collectImportDuplicateMatchInfo(userSubroutes).duplicateRouteIds;
}

export function getImportDuplicateRouteLabels(userSubroutes, duplicateRouteIds) {
  const labelByRouteId = new Map();
  for (const f of userSubroutes) {
    const routeId = f.properties?.route_id;
    if (typeof routeId !== "string" || labelByRouteId.has(routeId)) continue;
    labelByRouteId.set(routeId, resolveRouteDisplayNameFromProps(f.properties));
  }
  return duplicateRouteIds.map((routeId) => labelByRouteId.get(routeId) ?? routeId);
}

export function deleteUserRoutesByImportMatches(duplicateRouteIds, duplicateDisplayNames) {
  const idSet = new Set(Array.isArray(duplicateRouteIds) ? duplicateRouteIds : []);
  const nameSet = duplicateDisplayNames instanceof Set ? duplicateDisplayNames : new Set();
  if (!idSet.size && !nameSet.size) return;

  const toDelete = [];
  const seen = new Set();
  for (const f of store.subroutesFC.features) {
    if (routeKindOf(f) !== ROUTE_KIND_USER) continue;
    const routeId = f.properties?.route_id;
    if (typeof routeId !== "string" || seen.has(routeId)) continue;
    const displayName = normalizeRouteNameForDuplicateFromProps(f.properties);
    if ((displayName && nameSet.has(displayName)) || idSet.has(routeId)) {
      seen.add(routeId);
      toDelete.push(routeId);
    }
  }
  if (toDelete.length) deleteRoutes(toDelete);
}

export function countSubroutesInRoutesByIds(userSubroutes, routeIds) {
  const idSet = new Set(routeIds);
  return userSubroutes.filter((f) => idSet.has(f.properties?.route_id)).length;
}

export function buildImportResultStats(userSubroutes, userStations, mode, duplicateRouteIds) {
  const importRouteIds = new Set();
  for (const f of userSubroutes) {
    const routeId = f.properties?.route_id;
    if (typeof routeId === "string") importRouteIds.add(routeId);
  }
  const duplicateSet = new Set(duplicateRouteIds);
  const addedRouteIds = [...importRouteIds].filter((id) => !duplicateSet.has(id));
  const replacedSubRouteCount = countSubroutesInRoutesByIds(userSubroutes, duplicateRouteIds);
  const addedSubRouteCount = countSubroutesInRoutesByIds(userSubroutes, addedRouteIds);

  return {
    mode,
    subRouteCount: userSubroutes.length,
    stationCount: userStations.length,
    routeCount: importRouteIds.size,
    replacedRouteCount: duplicateRouteIds.length,
    addedRouteCount: addedRouteIds.length,
    replacedSubRouteCount,
    addedSubRouteCount,
  };
}

export function parseImportPayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("invalid_json");
  }
  if (
    data.format &&
    data.format !== EXPORT_FILE_FORMAT &&
    !LEGACY_IMPORT_FORMATS.has(data.format)
  ) {
    throw new Error("unsupported_format");
  }
  const allSubroutes = Array.isArray(data.userSubroutesFC?.features)
    ? data.userSubroutesFC.features
    : Array.isArray(data.subroutesFC?.features)
      ? data.subroutesFC.features
      : null;
  const allStations = Array.isArray(data.userStationsFC?.features)
    ? data.userStationsFC.features
    : Array.isArray(data.stationsFC?.features)
      ? data.stationsFC.features
      : null;
  if (!allSubroutes || !allStations) {
    throw new Error("missing_features");
  }
  const userSubroutes = extractUserOnlyRoutes(allSubroutes);
  const userSubrouteIds = new Set(userSubroutes.map((f) => f?.properties?.subroute_id).filter((id) => typeof id === "string"));
  const userStations = extractUserStationsByRoutes(allStations, userSubrouteIds)
    .map(sanitizeStationForExport)
    .filter(Boolean);
  const mapView =
    normalizeImportedMapView(data.mapView) ??
    normalizeImportedMapView(data.mapCenter) ??
    computeMapViewFromFeatures(userSubroutes, userStations);

  return {
    userSubroutes,
    userStations,
    hiddenSubrouteIds: Array.isArray(data.hiddenSubrouteIds) ? data.hiddenSubrouteIds : [],
    counters: data.counters,
    settings: data.settings,
    mapView,
  };
}

export function exportUserStateJSON() {
  return JSON.stringify(buildUserExportPayload(), null, 2);
}

function exportStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getExportFileName() {
  return `metro-multiverse-${exportStamp()}.json`;
}

function getExportFileNameForSelectedRoutes(routeCount) {
  return `metro-multiverse-selected-${routeCount}-${exportStamp()}.json`;
}

/**
 * @param {string[]} routeIds
 * @returns {{ ok: true, json: string, fileName: string } | { ok: false, error: string }}
 */
export function exportRoutesJSON(routeIds) {
  if (!Array.isArray(routeIds) || routeIds.length === 0) {
    return { ok: false, error: "no_lines" };
  }
  const payload = buildUserExportPayload(routeIds);
  if (!payload.userSubroutesFC.features.length) {
    return { ok: false, error: "no_user_routes" };
  }
  return {
    ok: true,
    json: JSON.stringify(payload, null, 2),
    fileName: getExportFileNameForSelectedRoutes(routeIds.length),
  };
}

/**
 * @param {string} jsonString
 * @returns {{ ok: true, duplicateRouteIds: string[], duplicateRouteLabels: string[] } | { ok: false, error: string }}
 */
export function analyzeImportJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    const { userSubroutes } = parseImportPayload(data);
    const duplicateRouteIds = getImportDuplicateRouteIds(userSubroutes);
    return {
      ok: true,
      duplicateRouteIds,
      duplicateRouteLabels: getImportDuplicateRouteLabels(userSubroutes, duplicateRouteIds),
    };
  } catch (e) {
    const code = e instanceof Error && e.message ? e.message : "import_failed";
    return { ok: false, error: code };
  }
}

/** @typedef {'replaceAll' | 'merge' | 'replaceMatching'} ImportMode */

/**
 * @param {string} jsonString
 * @param {{ mode?: ImportMode }} [options]
 * @returns {({ ok: true } & ReturnType<typeof buildImportResultStats>) | { ok: false, error: string }}
 */
export function importUserStateJSON(jsonString, options = {}) {
  /** @type {ReturnType<typeof captureUserStateSnapshot> | null} */
  let snapshotBeforeImport = null;
  try {
    const data = JSON.parse(jsonString);
    const { userSubroutes, userStations, hiddenSubrouteIds, mapView } = parseImportPayload(data);
    const mode = options.mode ?? "merge";
    const duplicateMatch =
      mode === "replaceMatching" ? collectImportDuplicateMatchInfo(userSubroutes) : null;
    const duplicateRouteIds = duplicateMatch?.duplicateRouteIds ?? [];
    const routeLimit = assertImportWithinUserRouteLimit(userSubroutes, mode, {
      duplicateRouteIds,
      duplicateDisplayNames: duplicateMatch?.duplicateDisplayNames,
    });
    if (!routeLimit.ok) {
      return {
        ok: false,
        error: routeLimit.code,
        limit: routeLimit.limit,
        current: routeLimit.current,
      };
    }

    return runWithSkipImportUndoInvalidate(() => {
      snapshotBeforeImport = captureUserStateSnapshot();
      if (mode === "replaceAll") {
        clearUserContent();
      } else if (mode === "replaceMatching" && duplicateMatch) {
        deleteUserRoutesByImportMatches(duplicateRouteIds, duplicateMatch.duplicateDisplayNames);
      }
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
      setLastImportUndoSnapshot(snapshotBeforeImport);
      refreshSources({ full: true });
      notifyImportUndoListeners();
      scheduleImportMapView(mapView);
      return { ok: true, mapView, ...buildImportResultStats(userSubroutes, userStations, mode, duplicateRouteIds) };
    });
  } catch (e) {
    if (snapshotBeforeImport) {
      restoreUserStateSnapshot(snapshotBeforeImport);
      clearLastImportUndoSnapshot();
      refreshSources({ full: true });
      notifyImportUndoListeners();
    }
    const code = e instanceof Error && e.message ? e.message : "import_failed";
    return { ok: false, error: code };
  }
}