import { useSyncExternalStore } from "react";
import { getStoreRevision, subscribeStoreRevision } from "./stateBoundary.js";

/**
 * @template T
 * @param {(revision: number) => T} selector
 */
export function useMetroSelector(selector) {
  return useSyncExternalStore(
    subscribeStoreRevision,
    () => selector(getStoreRevision()),
    () => selector(getStoreRevision()),
  );
}
