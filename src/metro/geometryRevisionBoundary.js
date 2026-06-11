import { emitMetroEvent, onMetroEvent } from "./metroEvents.js";

let geometryRevision = 0;

export function getGeometryRevision() {
  return geometryRevision;
}

export function bumpGeometryRevision() {
  geometryRevision += 1;
  emitMetroEvent("geometryRevision:bump", { revision: geometryRevision });
}

/** @param {() => void} fn */
export function subscribeGeometryRevisionBump(fn) {
  return onMetroEvent("geometryRevision:bump", () => fn());
}

