import { emitMetroEvent, onMetroEvent } from "./metroEvents.js";
import { bumpStoreRevision, getStoreRevision } from "./stateBoundary.js";

/** Call after store mutations that should refresh route list UI. */
export function notifyStoreChanged() {
  bumpStoreRevision();
}

export { getStoreRevision, bumpStoreRevision };

/** @param {{ persist?: boolean }} [options] */
export function notifyStoreCommitted(options = {}) {
  notifyStoreChanged();
  if (options.persist) {
    emitMetroEvent("store:persist", {});
  }
}
