import { emitMetroEvent, onMetroEvent } from "./metroEvents.js";

let storeRevision = 0;

export function getStoreRevision() {
  return storeRevision;
}

export function bumpStoreRevision() {
  storeRevision += 1;
  emitMetroEvent("store:changed", { revision: storeRevision });
}

/** @param {() => void} onStoreChange */
export function subscribeStoreRevision(onStoreChange) {
  return onMetroEvent("store:changed", () => onStoreChange());
}
