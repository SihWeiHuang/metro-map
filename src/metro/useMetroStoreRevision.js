import { useSyncExternalStore } from "react";
import { getStoreRevision, subscribeStoreRevision } from "./stateBoundary.js";

export function useMetroStoreRevision() {
  return useSyncExternalStore(subscribeStoreRevision, getStoreRevision, getStoreRevision);
}
