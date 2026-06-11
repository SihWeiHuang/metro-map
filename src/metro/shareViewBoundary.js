import { useSyncExternalStore } from "react";
import { emitMetroEvent, onMetroEvent } from "./metroEvents.js";

let shareViewActive = false;
let shareViewExpiresAt = /** @type {string | null} */ (null);

export function getShareViewActive() {
  return shareViewActive;
}

export function getShareViewExpiresAtState() {
  return shareViewExpiresAt;
}

export function setShareViewState(active, expiresAt = null) {
  shareViewActive = active;
  shareViewExpiresAt = expiresAt;
  emitMetroEvent("shareView:changed", { active, expiresAt });
}

function subscribeShare(onChange) {
  return onMetroEvent("shareView:changed", () => onChange());
}

export function useMetroShareView() {
  const active = useSyncExternalStore(subscribeShare, getShareViewActive, getShareViewActive);
  const expiresAt = useSyncExternalStore(
    subscribeShare,
    getShareViewExpiresAtState,
    getShareViewExpiresAtState,
  );
  return { shareViewActive: active, shareViewExpiresAt: expiresAt };
}
