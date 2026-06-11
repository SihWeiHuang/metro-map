import { useSyncExternalStore } from "react";
import { getMapMode, subscribeMapMode } from "./mapModeBoundary.js";

export function useMetroMapMode() {
  return useSyncExternalStore(subscribeMapMode, getMapMode, getMapMode);
}
