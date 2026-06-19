import { getMap } from "../mapInstance.js";
import { hasLayer, setLayerFilter, setMapLayoutProperty } from "../../map-runtime/mapEngine.js";
import { ensureMetroLayerStackOrder } from "../layers.js";
import { applyStationLabelCollision, applyStationLabelDragPlacement } from "../stationLabelCollision.js";
import { clearSmoothLineDisplayCache } from "../displayLineSmoothing.js";
import { clearStationHoverVisuals } from "../mapHoverFilters.js";
import { Route } from "../routeModel.js";
import {
  addMergePickSubrouteId,
  getMergePickSubrouteIds,
  resetMergePickSubrouteIds,
  setEditStationSubmodeState,
  setModeHintState,
} from "../../metro/mapInteractionBoundary.js";
import { notifyStoreChanged } from "../../metro/domainNotifier.js";
import { setMapMode } from "../../metro/mapModeBoundary.js";
import { t } from "../../i18n/i18n.js";
import {
  cur,
  DEFAULT_EDIT_STATION_SUBMODE,
  getEditStationSubmode,
  isEditStationSubmode,
  M,
  normalizeEditStationSubmode,
  setEditStationSubmodeLocal,
} from "./state.js";
import { cancelTempNodeDragListeners } from "./drag.js";
import { hideTransferSnapHint } from "../mapPopups.js";
import { clearHoverAndPopups, setCursorForMode } from "./hover.js";
import { setStationLabelMoveFrameVisibility, setZoomInteractionsEnabled } from "./mapUi.js";

export { setStationLabelMoveFrameVisibility, setZoomInteractionsEnabled };

const EDIT_SESSION_MODES = new Set(["add-route", "edit-route-select", "edit-route-active", "edit-station"]);
const METRO_LAYER_STACK_STABLE_MODES = new Set([
  "general",
  "add-route",
  "edit-route-select",
  "edit-route-active",
  "merge",
  "split-line",
]);

function shouldEnsureMetroLayerStackOrder(prevMode, nextMode) {
  return !METRO_LAYER_STACK_STABLE_MODES.has(prevMode) || !METRO_LAYER_STACK_STABLE_MODES.has(nextMode);
}

function getModeHintText() {
  switch (M.mode) {
    case "general":
      return t("modeHint.general");
    case "add-route":
    case "edit-route-active":
      return t("modeHint.routeNodeEdit");
    case "edit-route-select":
      return t("modeHint.editRouteSelect");
    case "edit-station": {
      const submode = getEditStationSubmode();
      if (submode === "move-label") return t("modeHint.editStationMoveLabel");
      return t("modeHint.editStationCrud");
    }
    case "merge":
      return getMergePickSubrouteIds().length === 0 ? t("modeHint.mergeFirst") : t("modeHint.mergeSecond");
    case "split-line":
      return t("modeHint.splitLine");
    default:
      return "";
  }
}

export function emitModeHint() {
  setModeHintState(getModeHintText());
}

export function refreshModeHint() {
  emitModeHint();
}

export function setEditStationSubmodeInternal(next) {
  if (getEditStationSubmode() === next) return;
  setEditStationSubmodeLocal(next);
  setEditStationSubmodeState(next);
  emitModeHint();
}

export function applyEditStationSubmode() {
  const map = getMap();
  if (!map || M.mode !== "edit-station") return;
  setZoomInteractionsEnabled(true);
  if (getEditStationSubmode() === "move-label") {
    hideTransferSnapHint();
    Route.clearHover();
    setLayerFilter(map, "routes-line-hover-casing", ["==", ["get", "subroute_id"], ""]);
    setLayerFilter(map, "routes-line-hover", ["==", ["get", "subroute_id"], ""]);
    clearStationHoverVisuals(map);
    setStationLabelMoveFrameVisibility(true);
    applyStationLabelDragPlacement(map);
  } else {
    setStationLabelMoveFrameVisibility(false);
    applyStationLabelCollision(map);
  }
}

export function updateTransferSnapVisibility() {
  const map = getMap();
  if (!map) return;
  const showAids = M.mode === "edit-station" && getEditStationSubmode() === "crud";
  const visibility = showAids ? "visible" : "none";
  if (hasLayer(map, "transfer-snaps-layer")) {
    setMapLayoutProperty(map, "transfer-snaps-layer", "visibility", visibility);
  }
  if (hasLayer(map, "transfer-absorb-zones-layer")) {
    setMapLayoutProperty(map, "transfer-absorb-zones-layer", "visibility", visibility);
  }
  if (hasLayer(map, "transfer-absorb-zones-outline-layer")) {
    setMapLayoutProperty(map, "transfer-absorb-zones-outline-layer", "visibility", visibility);
  }
  if (hasLayer(map, "transfer-absorb-zones-hover-layer")) {
    setMapLayoutProperty(map, "transfer-absorb-zones-hover-layer", "visibility", visibility);
  }
  if (hasLayer(map, "transfer-absorb-zones-hover-outline-layer")) {
    setMapLayoutProperty(map, "transfer-absorb-zones-hover-outline-layer", "visibility", visibility);
  }
}

export function setEditStationSubmode(next) {
  const normalized = normalizeEditStationSubmode(next);
  if (!isEditStationSubmode(normalized)) return;
  setEditStationSubmodeInternal(normalized);
  applyEditStationSubmode();
  if (normalized === "crud") {
    Route.ensureTransferSnapSourceReady();
    Route.ensureAbsorbZonesSourceReady();
  }
  updateTransferSnapVisibility();
  clearHoverAndPopups();
}

export function setMode(next) {
  if (M.mode === next) return;
  const prevMode = M.mode;
  cur()?.onLeave?.();
  M.mode = next;
  if (next === "general" && EDIT_SESSION_MODES.has(prevMode)) clearSmoothLineDisplayCache();
  cur()?.onEnter?.();
  setMapMode(next);
  setCursorForMode();
  clearHoverAndPopups();
  if (M.mode !== "edit-station") {
    setEditStationSubmodeInternal(DEFAULT_EDIT_STATION_SUBMODE);
    setZoomInteractionsEnabled(true);
  }
  updateTransferSnapVisibility();
  emitModeHint();
  const map = getMap();
  if (map && shouldEnsureMetroLayerStackOrder(prevMode, next)) ensureMetroLayerStackOrder(map);
}

function cancelTempRouteEditingSession(nextMode) {
  cancelTempNodeDragListeners();
  M.suppressNextEditMapClick = false;
  Route.cancelTempEditing();
  if (nextMode) setMode(nextMode);
  return { ok: true };
}

export function finishEditing() {
  if (M.mode === "edit-station") {
    document.getElementById("save-station-btn")?.click();
    setMode("general");
    return { ok: true, newRouteIds: [] };
  }
  if (M.mode === "edit-route-select") return exitEditRouteSelectMode();
  const result = Route.endTempEditingAndCommit();
  if (!result.ok && result.code === "route_limit_reached") {
    alert(t("routeModel.routeLimitReached", { limit: result.limit, current: result.current }));
    return result;
  }
  if (result.ok) {
    if (M.mode === "edit-route-active") setMode("edit-route-select");
    else setMode("general");
  }
  return result;
}

export function exitEditRouteSelectMode() {
  if (M.mode !== "edit-route-select") return { ok: false };
  Route.cancelTempEditing();
  setMode("general");
  return { ok: true, newRouteIds: [] };
}

export function cancelMerge() {
  setMode("general");
}

export function cancelRouteEditing() {
  if (M.mode === "edit-route-active") return cancelTempRouteEditingSession("edit-route-select");
  if (M.mode === "edit-route-select") return exitEditRouteSelectMode();
  if (M.mode === "add-route") return cancelTempRouteEditingSession("general");
  return { ok: false };
}

/** @returns {{ picked: boolean, merged?: boolean, ok?: boolean, msg?: string }} */
export function pickRouteForMerge(subrouteId) {
  if (M.mode !== "merge" || typeof subrouteId !== "string") return { picked: false };
  addMergePickSubrouteId(subrouteId);
  Route.highlightRoute(subrouteId);
  emitModeHint();
  const mergePick = getMergePickSubrouteIds();
  if (mergePick.length < 2) return { picked: true, merged: false };
  const res = Route.mergeRoutes(mergePick[0], mergePick[1]);
  if (!res.ok) {
    alert(res.msg);
    resetMergePickSubrouteIds();
    emitModeHint();
    return { picked: true, merged: false, ok: false, msg: res.msg };
  }
  alert(t("routeModel.mergeSuccess"));
  notifyStoreChanged();
  setMode("general");
  return { picked: true, merged: true, ok: true, msg: res.msg };
}

/** @returns {{ ok: boolean, msg?: string }} */
export function pickSubRouteForSplitLine(subrouteId) {
  if (M.mode !== "split-line" || typeof subrouteId !== "string") return { ok: false };
  const res = Route.splitLine(subrouteId);
  if (!res.ok) {
    if (res.code === "route_limit_reached") {
      alert(t("routeModel.routeLimitReached", { limit: res.limit, current: res.current }));
    } else if (res.msg) {
      alert(res.msg);
    }
  } else {
    alert(t("routeModel.splitLineSuccess"));
    notifyStoreChanged();
  }
  setMode("general");
  return res;
}
