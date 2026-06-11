/**
 * Map source refresh commands — sole entry from domain mutations to mapRenderer.
 */
import { store } from "../data/metroStore.js";
import { notifyStoreChanged } from "./domainNotifier.js";
import { schedulePersistToStorage } from "./persistenceAdapter.js";
import { setImportUndoAvailable } from "./importUndoBoundary.js";
import { markDisplayDirty, markDisplayFullDirty } from "../map-runtime/displayModel.js";
import {
  applyDirty,
  fullSync,
  stationDisplaySync,
  tempSync,
  visibilitySync,
} from "../map-runtime/mapRenderer.js";
import { getMap } from "../map/mapInstance.js";
import { getLastImportUndoSnapshot, invalidateImportUndoOnMutation } from "./routeImportUndoState.js";
import { splitMergedIntoLayers } from "../data/storeLayers.js";

function notifyImportUndoListeners() {
  setImportUndoAvailable(getLastImportUndoSnapshot() != null);
}

export function commitAfterMutation(options = {}) {
  const preview = options.preview === true;
  if (!preview && !options.skipPersist) schedulePersistToStorage();
  if (!preview && !options.skipNotify) notifyStoreChanged();
}

export function refreshSources(options = {}) {
  const preview = options.preview === true;
  splitMergedIntoLayers(store);
  const map = getMap();

  if (!preview && invalidateImportUndoOnMutation()) {
    notifyImportUndoListeners();
  }

  if (options.full === true || preview) {
    if (!preview) markDisplayFullDirty();
    fullSync(map, store, options);
  } else {
    applyDirty(map, store, options);
  }

  commitAfterMutation(options);
}

export function refreshSourcesWithDirty(subrouteIds, options = {}) {
  if (subrouteIds) markDisplayDirty(subrouteIds, store);
  refreshSources(options);
}

export function refreshTempEditSources() {
  tempSync(getMap(), store);
}

export function refreshStationDisplaySources() {
  splitMergedIntoLayers(store);
  schedulePersistToStorage();
  stationDisplaySync(getMap(), store);
}

export function applyHiddenSubrouteVisibility() {
  visibilitySync(getMap(), store);
}
