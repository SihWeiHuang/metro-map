import { useSyncExternalStore } from "react";
import { emitMetroEvent, onMetroEvent } from "./metroEvents.js";

let importUndoAvailable = false;

/** @type {Set<(available: boolean) => void>} */
const legacyListeners = new Set();

export function getImportUndoAvailable() {
  return importUndoAvailable;
}

export function setImportUndoAvailable(available) {
  importUndoAvailable = available;
  emitMetroEvent("importUndo:changed", { available });
  for (const fn of legacyListeners) fn(available);
}

/** @deprecated */
export function subscribeImportUndoAvailability(fn) {
  legacyListeners.add(fn);
  fn(importUndoAvailable);
  return () => legacyListeners.delete(fn);
}

function subscribeUndo(onChange) {
  return onMetroEvent("importUndo:changed", (p) => onChange(/** @type {{ available: boolean }} */ (p).available));
}

export function useMetroImportUndoAvailable() {
  return useSyncExternalStore(subscribeUndo, getImportUndoAvailable, getImportUndoAvailable);
}
