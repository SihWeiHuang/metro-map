/** Import undo snapshot — shared by render refresh and import service. */

/** @type {import('./routeStoreMutations.js').UserStateSnapshot | null} */
let lastImportUndoSnapshot = null;
let skipImportUndoInvalidate = false;

export function getLastImportUndoSnapshot() {
  return lastImportUndoSnapshot;
}

/** @param {import('./routeStoreMutations.js').UserStateSnapshot | null} snapshot */
export function setLastImportUndoSnapshot(snapshot) {
  lastImportUndoSnapshot = snapshot;
}

export function clearLastImportUndoSnapshot() {
  lastImportUndoSnapshot = null;
}

export function isSkipImportUndoInvalidate() {
  return skipImportUndoInvalidate;
}

export function runWithSkipImportUndoInvalidate(fn) {
  skipImportUndoInvalidate = true;
  try {
    return fn();
  } finally {
    skipImportUndoInvalidate = false;
  }
}

export function invalidateImportUndoOnMutation() {
  if (skipImportUndoInvalidate || !lastImportUndoSnapshot) return false;
  lastImportUndoSnapshot = null;
  return true;
}
