import { useSyncExternalStore } from "react";
import { emitMetroEvent, onMetroEvent } from "./metroEvents.js";

let modeHint = "";
let editStationSubmode = "crud";

/** @type {string[]} */
const mergePickSubrouteIds = [];
let mergePickRevision = 0;

export function getModeHint() {
  return modeHint;
}

export function setModeHintState(hint) {
  modeHint = hint;
  emitMetroEvent("modeHint:changed", { hint });
}

export function getEditStationSubmode() {
  return editStationSubmode;
}

export function setEditStationSubmodeState(submode) {
  editStationSubmode = submode;
  emitMetroEvent("editStationSubmode:changed", { submode });
}

export function getMergePickSubrouteIds() {
  return [...mergePickSubrouteIds];
}

export function getMergePickRevision() {
  return mergePickRevision;
}

function bumpMergePick() {
  mergePickRevision += 1;
  emitMetroEvent("mergePick:changed", { revision: mergePickRevision });
}

export function resetMergePickSubrouteIds() {
  if (mergePickSubrouteIds.length === 0) return;
  mergePickSubrouteIds.length = 0;
  bumpMergePick();
}

export function addMergePickSubrouteId(subrouteId) {
  if (typeof subrouteId !== "string" || mergePickSubrouteIds.includes(subrouteId)) return;
  mergePickSubrouteIds.push(subrouteId);
  bumpMergePick();
}

function subscribeHint(onChange) {
  return onMetroEvent("modeHint:changed", (p) => onChange(/** @type {{ hint: string }} */ (p).hint));
}

function subscribeSubmode(onChange) {
  return onMetroEvent("editStationSubmode:changed", (p) => onChange(/** @type {{ submode: string }} */ (p).submode));
}

function subscribeMergePick(onChange) {
  return onMetroEvent("mergePick:changed", () => onChange());
}

export function useMetroMapInteraction() {
  const hint = useSyncExternalStore(subscribeHint, getModeHint, getModeHint);
  const editStationSubmode = useSyncExternalStore(subscribeSubmode, getEditStationSubmode, getEditStationSubmode);
  return { modeHint: hint, editStationSubmode };
}

export function useMetroMergePick() {
  const revision = useSyncExternalStore(subscribeMergePick, getMergePickRevision, getMergePickRevision);
  void revision;
  return getMergePickSubrouteIds();
}
