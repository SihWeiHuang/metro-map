import { useSyncExternalStore } from "react";
import { emitMetroEvent, onMetroEvent } from "./metroEvents.js";

let mode = "general";

export function getMapMode() {
  return mode;
}

export function setMapMode(next) {
  if (mode === next) return;
  mode = next;
  emitMetroEvent("mode:changed", { mode: next });
}

export function subscribeMapMode(onChange) {
  return onMetroEvent("mode:changed", (p) => onChange(/** @type {{ mode: string }} */ (p).mode));
}

export function useMetroMapMode() {
  return useSyncExternalStore(subscribeMapMode, getMapMode, getMapMode);
}
