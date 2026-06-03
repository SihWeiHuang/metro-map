import * as turf from "@turf/turf";
import { getMap } from "./mapInstance.js";
import { ensureMetroLayerStackOrder } from "./layers.js";
import { applyStationLabelCollision, applyStationLabelDragPlacement } from "./stationLabelCollision.js";
import { clearSmoothLineDisplayCache, nearestPointOnSmoothedRoute } from "./displayLineSmoothing.js";
import { clearStationHoverVisuals, setStationHoverPairFilters } from "./mapHoverFilters.js";
import {
  Route,
  store,
  STATION_NAME_MAX_LEN,
  findNearestTransferSnap,
  isTransferSnapOccupied,
  TRANSFER_SNAP_HOVER_METERS,
  TRANSFER_SNAP_CLICK_METERS,
} from "./routeModel.js";
import {
  clearLabelDragLimitCircle,
  createStationLabelDragPreviewUpdater,
  drawLabelDragLimitCircle,
  getDisplayedStationCenter,
  getStationLabelVisualCoord,
  setStationPreviewCoord,
} from "./stationPreview.js";
import { t } from "../i18n/i18n.js";
import { resolveRouteDisplayNameFromProps, resolveStationDisplayName } from "./defaultNames.js";
import {
  closeStationEditPopup,
  hideHoverPopups,
  hideRouteHoverPopup,
  hideStationBrowsePopup,
  hideTransferSnapHint,
  initMapPopups,
  isBrowseHoverMode,
  isStationEditPopupOpen,
  openStationEditPopup,
  refreshEditStationTransferHint,
  scheduleTransferSnapHintUpdate,
  showRouteHoverPopup,
  showStationBrowsePopup,
} from "./mapPopups.js";

let onModeChange = () => {};
let onEditStationSubmodeChange = () => {};
let onModeHintChange = () => {};
let onMergePickChange = () => {};

export function registerModeChange(fn) {
  onModeChange = fn;
}

export function registerEditStationSubmodeChange(fn) {
  onEditStationSubmodeChange = fn;
}

export function registerModeHintChange(fn) {
  onModeHintChange = fn;
  onModeHintChange(getModeHintText());
}

export function registerMergePickChange(fn) {
  onMergePickChange = fn;
  onMergePickChange();
}

function emitMergePickChange() {
  onMergePickChange();
}

export function getMergePickSubrouteIds() {
  return [...mergePick];
}

/** @returns {{ picked: boolean, merged?: boolean, ok?: boolean, msg?: string }} */
export function pickRouteForMerge(subrouteId) {
  if (M.mode !== "merge" || typeof subrouteId !== "string") return { picked: false };
  if (!mergePick.includes(subrouteId)) mergePick.push(subrouteId);
  Route.highlightRoute(subrouteId);
  emitModeHint();
  emitMergePickChange();
  if (mergePick.length < 2) return { picked: true, merged: false };
  const res = Route.mergeRoutes(mergePick[0], mergePick[1]);
  if (!res.ok) alert(res.msg);
  else alert(t("routeModel.mergeSuccess"));
  setMode("general");
  return { picked: true, merged: true, ok: res.ok, msg: res.msg };
}

export const M = {
  mode: "general",
  dragging: {
    type: null,
    idx: null,
    stationId: null,
    subrouteId: null,
    isClickCandidate: false,
    downPoint: null,
  },
  pointer: { isDown: false },
  hover: { subrouteId: "", stationId: "", transferSnapId: "", passingKey: "" },
  /** 地圖選路線後略過緊接著的那次 click，避免誤加編輯點 */
  suppressNextEditMapClick: false,
};

const TRANSFER_SNAP_HINT_DEPS = {
  findNearest: findNearestTransferSnap,
  isOccupied: isTransferSnapOccupied,
  maxMeters: TRANSFER_SNAP_HOVER_METERS,
};

export const Modes = {};
const mergePick = [];
const LABEL_DRAG_RADIUS_METERS = 500;
let editStationSubmode = "station";

/** Left button only — middle button is reserved for map pan on desktop. */
function isPrimaryMouseButton(e) {
  const btn = e?.originalEvent?.button;
  return btn === undefined || btn === 0;
}

initMapPopups({
  getMap,
  getContext: () => ({
    mode: M.mode,
    editStationSubmode,
    draggingType: M.dragging.type,
  }),
});

/** Invisible line layer for temp-route picks (wider than visible line by 2px per side). */
export const TEMP_EDIT_LINE_HIT_LAYER = "temp-edit-line-hit-layer";

const STATION_CIRCLE_LAYERS = ["stations-circle", "transfer-stations-circle"];
const STATION_HOVER_CIRCLE_LAYERS = ["stations-circle-hover", "transfer-stations-circle-hover"];
const STATION_LABEL_LAYERS = ["stations-label", "stations-label-hover"];
const HOVER_PICK_LAYERS = [
  "transfer-snaps-layer",
  ...STATION_HOVER_CIRCLE_LAYERS,
  ...STATION_CIRCLE_LAYERS,
  ...STATION_LABEL_LAYERS,
  "routes-line",
];

let tempNodePreviewRaf = null;
let labelDragPreviewRaf = null;
/** @type {{ update: (coord: number[]) => void, coord: number[] } | null} */
let pendingLabelDragPreview = null;

function queryFeaturesAtPoint(map, point, layerIds, padPx = 0) {
  if (!layerIds.length) return [];
  if (!padPx) return map.queryRenderedFeatures(point, { layers: layerIds });
  const x = point.x;
  const y = point.y;
  const pad = padPx;
  return map.queryRenderedFeatures(
    [
      [x - pad, y - pad],
      [x + pad, y + pad],
    ],
    { layers: layerIds }
  );
}

function queryTempEditLineAtPoint(map, point) {
  const layers = map.getLayer(TEMP_EDIT_LINE_HIT_LAYER)
    ? [TEMP_EDIT_LINE_HIT_LAYER]
    : ["temp-edit-line-layer"];
  return queryFeaturesAtPoint(map, point, layers, 0);
}

const cur = () => Modes[M.mode];

function getModeHintText() {
  switch (M.mode) {
    case "general":
      return t("modeHint.general");
    case "add-route":
    case "edit-route-active":
      return t("modeHint.routeNodeEdit");
    case "edit-route-select":
      return t("modeHint.editRouteSelect");
    case "edit-station":
      return editStationSubmode === "move-label"
        ? t("modeHint.editStationMoveLabel")
        : t("modeHint.editStationStation");
    case "merge":
      return mergePick.length === 0 ? t("modeHint.mergeFirst") : t("modeHint.mergeSecond");
    case "split-line":
      return t("modeHint.splitLine");
    default:
      return "";
  }
}

function emitModeHint() {
  onModeHintChange(getModeHintText());
}

export function refreshModeHint() {
  emitModeHint();
}

function setActiveButton() {
  /* React 處理按鈕樣式 */
}

function setCursor(style) {
  const map = getMap();
  if (map) map.getCanvas().style.cursor = style || "";
}

function setEditStationSubmodeInternal(next) {
  if (editStationSubmode === next) return;
  editStationSubmode = next;
  onEditStationSubmodeChange(next);
  emitModeHint();
}

function setZoomInteractionsEnabled(enabled) {
  const map = getMap();
  if (!map) return;
  if (enabled) {
    map.scrollZoom.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
    map.keyboard.enable();
    return;
  }
  map.scrollZoom.disable();
  map.boxZoom.disable();
  map.doubleClickZoom.disable();
  map.touchZoomRotate.disable();
  map.keyboard.disable();
}

function setStationLabelMoveFrameVisibility(visible) {
  const map = getMap();
  if (!map?.getLayer("stations-label-move-frame")) return;
  map.setLayoutProperty("stations-label-move-frame", "visibility", visible ? "visible" : "none");
}

function applyEditStationSubmode() {
  const map = getMap();
  if (!map || M.mode !== "edit-station") return;
  setZoomInteractionsEnabled(true);
  if (editStationSubmode === "move-label") {
    hideTransferSnapHint();
    Route.clearHover();
    if (map.getLayer("routes-line-hover")) {
      map.setFilter("routes-line-hover", ["==", ["get", "subroute_id"], ""]);
    }
    clearStationHoverVisuals(map);
    setStationLabelMoveFrameVisibility(true);
    applyStationLabelDragPlacement(map);
  } else {
    setStationLabelMoveFrameVisibility(false);
    applyStationLabelCollision(map);
  }
}

function updateTransferSnapVisibility() {
  const map = getMap();
  if (!map || !map.getLayer("transfer-snaps-layer")) return;
  map.setLayoutProperty("transfer-snaps-layer", "visibility", M.mode === "edit-station" ? "visible" : "none");
}

export function setEditStationSubmode(next) {
  if (next !== "station" && next !== "move-label") return;
  setEditStationSubmodeInternal(next);
  applyEditStationSubmode();
}

export function setCursorForMode(e) {
  const map = getMap();
  if (!map) return;
  let cursor = "";
  if (M.mode === "edit-station" && (M.dragging.type === "station-label" || M.dragging.type === "station")) {
    setCursor("grabbing");
    return;
  }
  if (M.mode === "add-route" || M.mode === "edit-route-active") {
    if (M.dragging.type === "temp-node") {
      setCursor("grabbing");
      return;
    }
    cursor = "crosshair";
    if (e) {
      const onNode = map.queryRenderedFeatures(e.point, { layers: ["temp-edit-nodes-layer"] });
      if (onNode.length) {
        cursor = "grab";
      } else {
        const onStation = map.queryRenderedFeatures(e.point, { layers: STATION_CIRCLE_LAYERS });
        if (onStation.length) {
          cursor = "pointer";
        } else {
          const onExistingRoute = map.queryRenderedFeatures(e.point, { layers: ["routes-line"] });
          if (onExistingRoute.length) {
            cursor = "pointer";
          } else {
            if (queryTempEditLineAtPoint(map, e.point).length) cursor = "pointer";
          }
        }
      }
    }
  } else if (M.mode === "edit-station") {
    cursor = "grab";
    if (e) {
      const onRoute = map.queryRenderedFeatures(e.point, { layers: ["routes-line"] });
      const onStation = map.queryRenderedFeatures(e.point, { layers: STATION_CIRCLE_LAYERS });
      const onStationLabel = map.queryRenderedFeatures(e.point, {
        layers: [...STATION_LABEL_LAYERS, "stations-label-hover"],
      });
      if (editStationSubmode !== "move-label" && onRoute.length) cursor = "pointer";
      if (onStation.length) cursor = "grab";
      if (onStationLabel.length) cursor = "grab";
    }
  } else {
    cursor = "";
  }
  setCursor(cursor);
}

export function clearHoverAndPopups() {
  M.hover.subrouteId = "";
  M.hover.stationId = "";
  M.hover.transferSnapId = "";
  M.hover.passingKey = "";
  Route.clearHover();
  const map = getMap();
  if (map && M.mode === "edit-station" && editStationSubmode === "move-label") {
    applyStationLabelDragPlacement(map);
  }
  hideHoverPopups();
}

function clearStationHoverHighlight() {
  M.hover.stationId = "";
  setStationHoverPairFilters(getMap(), "");
}

function isDraftingHoverMode(mode = M.mode) {
  return mode === "add-route" || mode === "edit-route-active";
}

function isStationHoverLayerId(layerId) {
  return (
    layerId === "stations-circle" ||
    layerId === "transfer-stations-circle" ||
    layerId === "stations-circle-hover" ||
    layerId === "transfer-stations-circle-hover" ||
    layerId === "stations-label" ||
    layerId === "stations-label-hover"
  );
}

/** Topmost rendered feature wins (Mapbox returns hits top → bottom). */
function pickHoverTarget(map, point) {
  const hits = map.queryRenderedFeatures(point, { layers: HOVER_PICK_LAYERS });
  if (!hits.length) return null;

  const layerId = hits[0].layer?.id;
  if (isStationHoverLayerId(layerId)) {
    return { type: "station", feature: hits[0] };
  }
  if (layerId === "transfer-snaps-layer") {
    return { type: "transfer-snap", feature: hits[0] };
  }
  if (layerId === "routes-line") {
    return { type: "route", feature: hits[0] };
  }

  return null;
}

function primarySubrouteIdForStation(stationFeature) {
  const subrouteId = stationFeature?.properties?.subroute_id;
  if (subrouteId) return subrouteId;
  const transferRoutes = stationFeature?.properties?.transfer_routes;
  if (Array.isArray(transferRoutes) && transferRoutes.length > 0) return transferRoutes[0];
  return "";
}

function applyBrowseRouteHover(lngLat, routeFeature, point) {
  const rid = routeFeature.properties.subroute_id;
  const routeId = routeFeature.properties.route_id || "";
  const prevRoute = M.hover.subrouteId
    ? store.subroutesFC.features.find((f) => f.properties.subroute_id === M.hover.subrouteId)
    : null;
  const sameRoute =
    M.hover.stationId === "" &&
    ((routeId && prevRoute?.properties?.route_id === routeId) || (!routeId && M.hover.subrouteId === rid));
  M.hover.subrouteId = rid;
  M.hover.stationId = "";
  if (!sameRoute) Route.highlightRoute(rid);
  hideStationBrowsePopup();
  popupRoute(lngLat, rid, point);
}

function applyBrowseStationHover(lngLat, stationFeature, point) {
  const sid = stationFeature.properties.station_id;
  const passingIds = [...collectPassingSubrouteIdsForPopup(stationFeature)];
  if (!passingIds.length) return;
  const passingKey = passingIds.sort().join("\0");
  if (M.hover.stationId === sid && M.hover.passingKey === passingKey) return;
  M.hover.stationId = sid;
  M.hover.subrouteId = "";
  M.hover.passingKey = passingKey;
  Route.highlightPassingSubroutes(passingIds);
  hideRouteHoverPopup();
  popupStation(lngLat, stationFeature, point, passingIds);
}

function applyDraftingHover(target) {
  if (target?.type !== "station") return;
  if (!M.hover.subrouteId && !M.hover.stationId) return;
  M.hover.subrouteId = "";
  M.hover.stationId = "";
  Route.clearHover();
}

function updateEditStationHover(e, target) {
  if (editStationSubmode === "move-label") return;
  if (isStationEditPopupOpen()) return;
  if (M.pointer.isDown) return;
  if (M.dragging.type === "station" || M.dragging.type === "station-label") return;

  if (!target) {
    clearHoverAndPopups();
    return;
  }

  const snapNear = findNearestTransferSnap(e.lngLat, TRANSFER_SNAP_HOVER_METERS);
  const snapActive = snapNear && !isTransferSnapOccupied(snapNear.feature);

  if (target.type === "station") {
    const st = target.feature;
    const sid = st.properties.station_id;
    const rid = primarySubrouteIdForStation(st);
    const map = getMap();
    if (M.hover.stationId === sid && M.hover.subrouteId === rid) {
      hideTransferSnapHint();
      return;
    }
    M.hover.stationId = sid;
    M.hover.subrouteId = rid || "";
    M.hover.transferSnapId = "";
    setStationHoverPairFilters(map, sid);
    hideStationBrowsePopup();
    hideTransferSnapHint();
    return;
  }

  if (target.type === "transfer-snap") {
    if (!isTransferSnapOccupied(target.feature)) {
      M.hover.stationId = "";
      M.hover.transferSnapId = target.feature.properties?.snap_id || "";
      hideStationBrowsePopup();
      refreshEditStationTransferHint(e.lngLat, TRANSFER_SNAP_HINT_DEPS, { feature: target.feature });
    } else {
      M.hover.transferSnapId = "";
      hideTransferSnapHint();
    }
    return;
  }

  const rid = target.feature.properties.subroute_id;
  if (snapActive) {
    if (M.hover.subrouteId !== rid) {
      M.hover.subrouteId = rid;
      Route.highlightRoute(rid);
    }
    M.hover.stationId = "";
    M.hover.transferSnapId = snapNear.feature.properties?.snap_id || "";
    hideStationBrowsePopup();
    refreshEditStationTransferHint(e.lngLat, TRANSFER_SNAP_HINT_DEPS, snapNear);
    return;
  }

  const sameRoute = M.hover.subrouteId === rid;
  M.hover.subrouteId = rid;
  M.hover.stationId = "";
  M.hover.transferSnapId = "";
  if (!sameRoute) Route.highlightRoute(rid);
  hideStationBrowsePopup();
  hideTransferSnapHint();
}

function updateHoverFromPointer(e) {
  if (M.dragging.type) return;

  const map = getMap();
  if (!map) return;

  const target = pickHoverTarget(map, e.point);

  if (isBrowseHoverMode()) {
    if (M.pointer.isDown) return;
    if (!target) {
      clearHoverAndPopups();
      return;
    }
    if (target.type === "station") {
      applyBrowseStationHover(e.lngLat, target.feature, e.point);
    } else {
      applyBrowseRouteHover(e.lngLat, target.feature, e.point);
    }
    return;
  }

  if (isDraftingHoverMode()) {
    applyDraftingHover(target);
    return;
  }

  if (M.mode === "edit-station") {
    updateEditStationHover(e, target);
  }
}

export function popupRoute(lngLat, subrouteId, point) {
  showRouteHoverPopup(lngLat, subrouteId, point, { routes: store.subroutesFC.features });
}

function addSubrouteIdToSet(ids, subrouteId) {
  if (subrouteId == null || subrouteId === "") return;
  ids.add(String(subrouteId));
}

function collectSubrouteIdsForStation(station) {
  const ids = new Set();
  addSubrouteIdToSet(ids, station?.properties?.subroute_id);
  const transferRoutes = station?.properties?.transfer_routes;
  if (Array.isArray(transferRoutes)) {
    transferRoutes.forEach((rid) => addSubrouteIdToSet(ids, rid));
  }
  return ids;
}

function resolveStoreStation(stationFeature) {
  const sid = stationFeature?.properties?.station_id;
  if (typeof sid !== "string") return stationFeature;
  return store.stationsFC.features.find((f) => f.properties?.station_id === sid) || stationFeature;
}

/** 彙整 hover 車站經過的路線 id（含 store 完整屬性與近距離共點）。 */
function collectPassingSubrouteIdsForPopup(hoveredFeature) {
  const ids = new Set();
  const storeStation = resolveStoreStation(hoveredFeature);

  const addFromStation = (station) => {
    collectSubrouteIdsForStation(station).forEach((rid) => ids.add(rid));
  };

  addFromStation(hoveredFeature);
  addFromStation(storeStation);

  const anchorCoord = storeStation?.geometry?.coordinates || hoveredFeature?.geometry?.coordinates;
  if (anchorCoord) {
    const coincidentRadiusMeters = 10;
    const [lng, lat] = anchorCoord;
    const roughDeg = 0.00012;
    for (const feature of store.stationsFC.features) {
      const c = feature.geometry.coordinates;
      if (Math.abs(c[0] - lng) > roughDeg || Math.abs(c[1] - lat) > roughDeg) continue;
      const distance = turf.distance(c, anchorCoord, { units: "meters" });
      if (distance <= coincidentRadiusMeters) addFromStation(feature);
    }
  }

  return ids;
}

function addNearbyTransferStationFromClick(lngLat, highlightSubrouteId = "") {
  const snapNear = findNearestTransferSnap(lngLat, TRANSFER_SNAP_CLICK_METERS);
  if (!snapNear || isTransferSnapOccupied(snapNear.feature)) return false;
  const snapId = snapNear.feature.properties?.snap_id || "";
  if (!snapId || snapId !== M.hover.transferSnapId) return false;

  const p = snapNear.feature.properties;
  Route.addTransferStationAt(snapNear.feature.geometry.coordinates, p.subroute_id_a, p.subroute_id_b);
  if (highlightSubrouteId) Route.highlightRoute(highlightSubrouteId);
  return true;
}

function isStationLayerId(layerId) {
  return (
    layerId === "stations-circle" ||
    layerId === "transfer-stations-circle" ||
    layerId === "stations-label" ||
    layerId === "stations-label-hover"
  );
}

const STATION_EDIT_CLICK_LAYERS = [
  "transfer-snaps-layer",
  ...STATION_CIRCLE_LAYERS,
  ...STATION_LABEL_LAYERS,
  "stations-label-hover",
  "routes-line",
];

function stationFeatureFromMapClick(hitFeatures) {
  if (!hitFeatures?.length) return null;
  const hovered = findHoveredStationFeature(hitFeatures);
  if (hovered) return hovered;
  return hitFeatures.find((f) => isStationLayerId(f.layer?.id) && f.properties?.station_id) || null;
}

function openStationEditPopupFromClick(e) {
  if (editStationSubmode === "move-label") return false;
  const feature = e.features?.[0];
  if (feature?.properties?.station_id && isStationLayerId(feature.layer?.id)) {
    popupStationForEditing(feature);
    return true;
  }
  return false;
}

function findHoveredStationFeature(hitFeatures) {
  if (!M.hover.stationId) return null;
  return hitFeatures.find((feature) => {
    return isStationLayerId(feature.layer?.id) && feature.properties?.station_id === M.hover.stationId;
  });
}

/** 車站 popup：列出經過此站的路線（合併後同 route_id 只顯示一次）。 */
function buildPassingRouteLabels(passingSubrouteIds) {
  const labels = [];
  const seenRouteIds = new Set();
  for (const subrouteId of passingSubrouteIds) {
    const feature = store.subroutesFC.features.find((f) => f.properties.subroute_id === subrouteId);
    if (!feature) continue;
    const routeId = feature.properties.route_id;
    if (routeId && seenRouteIds.has(routeId)) continue;
    if (routeId) seenRouteIds.add(routeId);
    labels.push(resolveRouteDisplayNameFromProps(feature.properties));
  }
  return labels;
}

export function popupStation(lngLat, st, point, passingSubrouteIdsPrecomputed) {
  const p = st.properties;
  const passingSubrouteIds = passingSubrouteIdsPrecomputed ?? collectPassingSubrouteIdsForPopup(st);
  const routeLabels = buildPassingRouteLabels(passingSubrouteIds);

  const stationNameHTML = `<div class="map-hover-popup__title">${resolveStationDisplayName(p)}</div>`;
  let lineInfoHTML = "";

  if (routeLabels.length > 0) {
    lineInfoHTML =
      `<div class="map-hover-popup__divider"></div>` +
      `<ul class="map-hover-popup__list">` +
      routeLabels.map((name) => `<li>${name}</li>`).join("") +
      "</ul>";
  }

  const estHeight = 44 + routeLabels.length * 22;
  const bodyHtml = `<div class="map-hover-popup__body">${stationNameHTML}${lineInfoHTML}</div>`;
  showStationBrowsePopup(lngLat, bodyHtml, point, estHeight);
}

function escapeHtmlAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function popupStationForEditing(station) {
  hideRouteHoverPopup();
  hideStationBrowsePopup();
  hideTransferSnapHint();

  const p = station.properties;
  const currentName = resolveStationDisplayName(p);
  const safeName = escapeHtmlAttr(currentName);

  const saveLabel = t("popup.save");
  const deleteLabel = t("popup.delete");
  const initialLen = currentName.length;
  const html = `
    <div class="station-edit-popup__body map-hover-popup__body">
      <div class="station-edit-popup__header">
        <span class="station-edit-popup__title">${t("popup.editStationTitle")}</span>
        <span id="station-name-count" class="station-edit-popup__count" aria-live="polite">${initialLen}/${STATION_NAME_MAX_LEN}</span>
      </div>
      <input
        type="text"
        id="station-name-input"
        class="station-edit-popup__input"
        value="${safeName}"
        maxlength="${STATION_NAME_MAX_LEN}"
        autocomplete="off"
        spellcheck="false"
        aria-label="${escapeHtmlAttr(t("popup.editStationTitle"))}"
      />
      <div class="station-edit-popup__actions">
        <button type="button" id="delete-station-btn" class="station-edit-popup__btn station-edit-popup__btn--danger">${deleteLabel}</button>
        <button type="button" id="save-station-btn" class="station-edit-popup__btn station-edit-popup__btn--primary">${saveLabel}</button>
      </div>
    </div>
  `;
  openStationEditPopup(station.geometry.coordinates, html);

  setTimeout(() => {
    const input = document.getElementById("station-name-input");
    const saveBtn = document.getElementById("save-station-btn");
    const deleteBtn = document.getElementById("delete-station-btn");
    const countEl = document.getElementById("station-name-count");
    input?.focus();
    input?.select();

    const syncNameCount = () => {
      if (!countEl || !input) return;
      const len = input.value.length;
      countEl.textContent = `${len}/${STATION_NAME_MAX_LEN}`;
      countEl.classList.toggle("station-edit-popup__count--at-limit", len >= STATION_NAME_MAX_LEN);
    };
    syncNameCount();
    input?.addEventListener("input", syncNameCount);

    const onSave = () => {
      Route.setStationName(p.station_id, input?.value ?? "");
      closeStationEditPopup();
    };

    saveBtn?.addEventListener("click", onSave);
    input?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        onSave();
      }
    });

    deleteBtn?.addEventListener("click", () => {
      if (confirm(t("popup.confirmDeleteStation", { name: currentName }))) {
        Route.removeStation(p.station_id);
        closeStationEditPopup();
      }
    });
  }, 0);
}

const EDIT_SESSION_MODES = new Set(["add-route", "edit-route-select", "edit-route-active", "edit-station"]);

export function setMode(next) {
  if (M.mode === next) return;
  const prevMode = M.mode;
  cur()?.onLeave?.();
  M.mode = next;
  if (next === "general" && EDIT_SESSION_MODES.has(prevMode)) {
    clearSmoothLineDisplayCache();
  }
  cur()?.onEnter?.();
  setActiveButton();
  onModeChange(next);
  setCursorForMode();
  clearHoverAndPopups();
  if (M.mode !== "edit-station") {
    setEditStationSubmodeInternal("station");
    setZoomInteractionsEnabled(true);
  }
  updateTransferSnapVisibility();
  emitModeHint();
  const map = getMap();
  if (map) ensureMetroLayerStackOrder(map);
}

function cancelTempRouteEditingSession(nextMode) {
  if (tempNodePreviewRaf !== null) {
    cancelAnimationFrame(tempNodePreviewRaf);
    tempNodePreviewRaf = null;
  }
  if (M.dragging.type === "temp-node") {
    const map = getMap();
    map?.off("mousemove", onDragMoveAddRoute);
    M.dragging.type = null;
    M.dragging.idx = null;
    M.dragging.subrouteId = null;
    M.dragging.isClickCandidate = false;
    M.dragging.downPoint = null;
  }
  M.suppressNextEditMapClick = false;
  Route.cancelTempEditing();
  if (nextMode) setMode(nextMode);
  return { ok: true };
}

export function finishEditing() {
  if (M.mode === "edit-station") {
    const saveBtn = document.getElementById("save-station-btn");
    if (saveBtn) {
      saveBtn.click();
    }
    setMode("general");
    return { ok: true, newRouteIds: [] };
  }

  if (M.mode === "edit-route-select") {
    return exitEditRouteSelectMode();
  }

  const result = Route.endTempEditingAndCommit();
  if (!result.ok && result.code === "route_limit_reached") {
    alert(t("routeModel.routeLimitReached", { limit: result.limit, current: result.current }));
    return result;
  }
  if (result.ok) {
    if (M.mode === "edit-route-active") {
      setMode("edit-route-select");
    } else {
      setMode("general");
    }
  }
  return result;
}

/** Leave edit-route pick mode (no route selected); edit toolbar stays open. */
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
  if (M.mode === "edit-route-active") {
    return cancelTempRouteEditingSession("edit-route-select");
  }
  if (M.mode === "edit-route-select") {
    return exitEditRouteSelectMode();
  }
  if (M.mode === "add-route") {
    return cancelTempRouteEditingSession("general");
  }
  return { ok: false };
}

function onMapClickWhileEditing(e) {
  if (M.suppressNextEditMapClick) {
    M.suppressNextEditMapClick = false;
    return;
  }

  const map = getMap();
  if (!map) return;

  const sessions = store.temp.editingSessions || [];
  if (!sessions.length) return;

  const addNodeToNearestRouteEndpoint = (coord) => {
    let best = null;
    let bestDist = Infinity;

    sessions.forEach((session) => {
      const nodes = session.nodes || [];
      if (!nodes.length) return;
      const startPoint = turf.point(nodes[0]);
      const endPoint = turf.point(nodes[nodes.length - 1]);
      const clickedPoint = turf.point(coord);
      const distToStart = turf.distance(clickedPoint, startPoint, { units: "meters" });
      const distToEnd = turf.distance(clickedPoint, endPoint, { units: "meters" });
      const insertAtStart = distToStart <= distToEnd;
      const nearestDist = insertAtStart ? distToStart : distToEnd;
      if (nearestDist < bestDist) {
        bestDist = nearestDist;
        best = {
          subrouteId: session.subrouteId,
          insertAtStart,
        };
      }
    });

    if (!best) {
      Route.addTempNodeAt(coord, sessions[0].subrouteId);
      return;
    }
    if (best.insertAtStart) {
      Route.addTempNodeAt(coord, best.subrouteId, 0);
    } else {
      Route.addTempNodeAt(coord, best.subrouteId);
    }
  };

  const isNearAnyEndpoint = (coord, thresholdMeters = 1) => {
    for (const session of sessions) {
      const nodes = session.nodes || [];
      if (!nodes.length) continue;
      const startDist = turf.distance(turf.point(coord), turf.point(nodes[0]), { units: "meters" });
      const endDist = turf.distance(turf.point(coord), turf.point(nodes[nodes.length - 1]), { units: "meters" });
      if (startDist < thresholdMeters || endDist < thresholdMeters) return true;
    }
    return false;
  };

  const nodeHits = queryFeaturesAtPoint(map, e.point, ["temp-edit-nodes-layer"]);
  if (nodeHits.length) {
    const properties = nodeHits[0].properties || {};
    Route.deleteTempNodeByIndex(properties.idx, properties.subroute_id);
    return;
  }

  const tempLineHits = queryTempEditLineAtPoint(map, e.point);
  if (tempLineHits.length) {
    const properties = tempLineHits[0].properties || {};
    Route.insertTempNodeOnSegment(e.point, properties.subroute_id);
    return;
  }

  const hitFeatures = queryFeaturesAtPoint(map, e.point, [...STATION_CIRCLE_LAYERS, "routes-line"]);

  if (hitFeatures.length) {
    const topFeature = hitFeatures[0];
    const topLayerId = topFeature.layer.id;

    switch (topLayerId) {
      case "stations-circle":
      case "transfer-stations-circle": {
        const stationCoord = topFeature.geometry.coordinates;
        if (isNearAnyEndpoint(stationCoord)) return;
        Route.queueStationFromExisting(stationCoord);
        return;
      }
      case "routes-line": {
        const snapped = turf.nearestPointOnLine(topFeature, [e.lngLat.lng, e.lngLat.lat], { units: "meters" });
        if (snapped?.geometry?.coordinates) {
          addNodeToNearestRouteEndpoint(snapped.geometry.coordinates);
        }
        return;
      }
      default:
        break;
    }
  }

  addNodeToNearestRouteEndpoint([e.lngLat.lng, e.lngLat.lat]);
}

function onDragMoveAddRoute(e) {
  if (M.dragging.type !== "temp-node") return;

  if (M.dragging.isClickCandidate) {
    const dist = Math.sqrt(
      Math.pow(e.point.x - M.dragging.downPoint.x, 2) + Math.pow(e.point.y - M.dragging.downPoint.y, 2)
    );
    if (dist > 5) {
      M.dragging.isClickCandidate = false;
    }
  }

  if (!M.dragging.isClickCandidate) {
    Route.updateTempNodeCoord(M.dragging.idx, [e.lngLat.lng, e.lngLat.lat], M.dragging.subrouteId);
    scheduleTempNodePreviewRefresh();
  }
}

function scheduleTempNodePreviewRefresh() {
  if (tempNodePreviewRaf !== null) return;
  tempNodePreviewRaf = requestAnimationFrame(() => {
    tempNodePreviewRaf = null;
    Route.refreshTempEditSources();
  });
}

function scheduleLabelDragPreview(update, coord) {
  pendingLabelDragPreview = { update, coord };
  if (labelDragPreviewRaf !== null) return;
  labelDragPreviewRaf = requestAnimationFrame(() => {
    labelDragPreviewRaf = null;
    const pending = pendingLabelDragPreview;
    pendingLabelDragPreview = null;
    if (pending) pending.update(pending.coord);
  });
}

function flushLabelDragPreview() {
  if (labelDragPreviewRaf !== null) {
    cancelAnimationFrame(labelDragPreviewRaf);
    labelDragPreviewRaf = null;
  }
  const pending = pendingLabelDragPreview;
  pendingLabelDragPreview = null;
  if (pending) pending.update(pending.coord);
}

function finishTempNodeDrag() {
  if (tempNodePreviewRaf !== null) {
    cancelAnimationFrame(tempNodePreviewRaf);
    tempNodePreviewRaf = null;
  }
  Route.refreshTempEditSources();
  Route.refreshSources();
}

/** 同步更新站點圓與站名（同一幀、不經 rAF 佇列）。 */
function updateStationDragPreview(map, sid, lngLat) {
  const st = store.stationsFC.features.find((x) => x.properties.station_id === sid);
  const rid = st?.properties?.subroute_id;
  const route = rid ? store.subroutesFC.features.find((x) => x.properties?.subroute_id === rid) : null;
  if (route?.geometry?.type === "LineString" && route.geometry.coordinates?.length >= 2) {
    const snapped = nearestPointOnSmoothedRoute(route.geometry.coordinates, lngLat);
    setStationPreviewCoord(map, sid, snapped?.geometry?.coordinates || lngLat);
    return;
  }
  setStationPreviewCoord(map, sid, lngLat);
}

function beginStationPositionDrag(e) {
  if (!isPrimaryMouseButton(e)) return;
  e.preventDefault();
  const feature = e.features?.[0];
  if (!feature?.properties?.station_id) return;
  if (feature.properties?.is_transfer_fixed) return;

  const sid = feature.properties.station_id;
  M.dragging.type = "station";
  M.dragging.stationId = sid;

  const map = getMap();
  clearStationHoverHighlight();
  applyStationLabelDragPlacement(map);

  const onDragStation = (ev) => {
    if (M.dragging.type !== "station" || M.dragging.stationId !== sid) return;
    updateStationDragPreview(map, sid, [ev.lngLat.lng, ev.lngLat.lat]);
  };

  map.on("mousemove", onDragStation);
  map.once("mouseup", (ev) => {
    map.off("mousemove", onDragStation);
    updateStationDragPreview(map, sid, [ev.lngLat.lng, ev.lngLat.lat]);
    const finalCoord = getDisplayedStationCenter(map, sid, feature.geometry.coordinates);
    Route.moveStationAlongRoute(sid, finalCoord);
    applyStationLabelCollision(map);
    M.dragging.type = null;
    M.dragging.stationId = null;
    setCursorForMode();
  });
}

function clampLabelCoordToDragRadius(dragCenter, targetCoord) {
  const d = turf.distance(turf.point(dragCenter), turf.point(targetCoord), { units: "meters" });
  if (d <= LABEL_DRAG_RADIUS_METERS) return targetCoord;
  const bearing = turf.bearing(turf.point(dragCenter), turf.point(targetCoord));
  const capped = turf.destination(turf.point(dragCenter), LABEL_DRAG_RADIUS_METERS, bearing, { units: "meters" });
  return capped.geometry.coordinates;
}

function beginStationLabelOnlyDrag(e) {
  if (!isPrimaryMouseButton(e)) return;
  e.preventDefault();
  e.originalEvent?.stopPropagation?.();
  const feature = e.features?.[0];
  if (!feature?.properties?.station_id) return;

  const sid = feature.properties.station_id;
  const st = store.stationsFC.features.find((x) => x.properties.station_id === sid);
  if (!st) return;

  const map = getMap();
  M.dragging.type = "station-label";
  M.dragging.stationId = sid;

  applyStationLabelDragPlacement(map);
  const dragCenter = getDisplayedStationCenter(map, sid, st.geometry.coordinates);
  drawLabelDragLimitCircle(map, dragCenter, LABEL_DRAG_RADIUS_METERS);
  // icon-text-fit 外框會在每次 setData 時重算全部站名，拖曳中先關閉以保持流暢。
  setStationLabelMoveFrameVisibility(false);

  const updatePreview = createStationLabelDragPreviewUpdater(map, sid, dragCenter);
  const centerPx = map.project(dragCenter);
  const offset = feature.properties?.label_offset_xy;
  const visualPx = Array.isArray(offset)
    ? { x: centerPx.x + offset[0] * 12, y: centerPx.y + offset[1] * 12 }
    : { x: e.point.x, y: e.point.y };
  const grabOffsetPx = { x: visualPx.x - e.point.x, y: visualPx.y - e.point.y };
  let currentLabelCoord = getStationLabelVisualCoord(map, sid, dragCenter);

  const onDragLabel = (ev) => {
    if (M.dragging.type !== "station-label" || M.dragging.stationId !== sid) return;
    const targetPx = { x: ev.point.x + grabOffsetPx.x, y: ev.point.y + grabOffsetPx.y };
    const targetLngLat = map.unproject([targetPx.x, targetPx.y]);
    const targetCoord = [targetLngLat.lng, targetLngLat.lat];
    currentLabelCoord = clampLabelCoordToDragRadius(dragCenter, targetCoord);
    scheduleLabelDragPreview(updatePreview, currentLabelCoord);
  };

  map.on("mousemove", onDragLabel);
  map.once("mouseup", () => {
    map.off("mousemove", onDragLabel);
    flushLabelDragPreview();
    Route.setStationLabelPosition(sid, currentLabelCoord);
    clearLabelDragLimitCircle(map);
    if (editStationSubmode === "move-label") {
      setStationLabelMoveFrameVisibility(true);
      applyStationLabelDragPlacement(map);
    } else {
      applyStationLabelCollision(map);
    }
    M.dragging.type = null;
    M.dragging.stationId = null;
    setCursorForMode();
  });
}

Modes.general = {
  name: "general",
  onEnter() {},
  onLeave() {},
  onMapMove() {},
};

Modes["add-route"] = {
  name: "add-route",
  onEnter() {
    Route.startNewTempRoute();
    Route.clearHover();
  },
  onLeave() {},

  onMapClick(e) {
    const map = getMap();

    const nodeHits = queryFeaturesAtPoint(map, e.point, ["temp-edit-nodes-layer"]);
    if (nodeHits.length) {
      const properties = nodeHits[0].properties;
      Route.deleteTempNodeByIndex(properties.idx, properties.subroute_id);
      return;
    }

    const tempLineHits = queryTempEditLineAtPoint(map, e.point);
    if (tempLineHits.length) {
      const properties = tempLineHits[0].properties;
      Route.insertTempNodeOnSegment(e.point, properties.subroute_id);
      return;
    }

    const hitFeatures = queryFeaturesAtPoint(map, e.point, [...STATION_CIRCLE_LAYERS, "routes-line"]);

    if (hitFeatures.length) {
      const topLayerId = hitFeatures[0].layer.id;

      switch (topLayerId) {
        case "stations-circle":
        case "transfer-stations-circle":
          Route.queueStationFromExisting(hitFeatures[0].geometry.coordinates);
          break;
        case "routes-line": {
          const snapped = turf.nearestPointOnLine(hitFeatures[0], [e.lngLat.lng, e.lngLat.lat]);
          if (snapped) {
            const session = Route._store.temp.editingSessions[0];
            const nodes = session.nodes;

            if (nodes.length > 0) {
              const startPoint = turf.point(nodes[0]);
              const endPoint = turf.point(nodes[nodes.length - 1]);
              const snappedPoint = turf.point(snapped.geometry.coordinates);

              const distToStart = turf.distance(snappedPoint, startPoint);
              const distToEnd = turf.distance(snappedPoint, endPoint);

              if (distToStart < distToEnd) {
                Route.addTempNodeAt(snapped.geometry.coordinates, session.subrouteId, 0);
              } else {
                Route.addTempNodeAt(snapped.geometry.coordinates, session.subrouteId);
              }
            } else {
              Route.addTempNodeAt(snapped.geometry.coordinates, session.subrouteId);
            }
          }
          break;
        }
      }
    } else {
      const session = Route._store.temp.editingSessions[0];
      const nodes = session.nodes;
      const clickCoord = [e.lngLat.lng, e.lngLat.lat];

      if (nodes.length > 0) {
        const startPoint = turf.point(nodes[0]);
        const endPoint = turf.point(nodes[nodes.length - 1]);
        const clickedPoint = turf.point(clickCoord);

        const distToStart = turf.distance(clickedPoint, startPoint);
        const distToEnd = turf.distance(clickedPoint, endPoint);

        if (distToStart < distToEnd) {
          Route.addTempNodeAt(clickCoord, session.subrouteId, 0);
        } else {
          Route.addTempNodeAt(clickCoord, session.subrouteId);
        }
      } else {
        Route.addTempNodeAt(clickCoord, session.subrouteId);
      }
    }
  },

  onTempNodeDown(e) {
    if (!isPrimaryMouseButton(e)) return;
    e.preventDefault();
    e.originalEvent.stopPropagation();
    const f = e.features && e.features[0];
    if (!f) return;

    M.dragging.type = "temp-node";
    M.dragging.idx = f.properties.idx;
    M.dragging.subrouteId = f.properties.subroute_id;
    M.dragging.isClickCandidate = true;
    M.dragging.downPoint = e.point;
    setCursor("grabbing");

    const map = getMap();
    map.on("mousemove", onDragMoveAddRoute);
    map.once("mouseup", () => {
      map.off("mousemove", onDragMoveAddRoute);
      finishTempNodeDrag();
      M.dragging.type = null;
      M.dragging.isClickCandidate = false;
      M.dragging.downPoint = null;
      setCursorForMode();
    });
  },

  onTempLineClick: null,
  onGlobalUp: null,
  onTempNodeClick: null,
  onRouteClick: null,
};

Modes["edit-route-select"] = {
  name: "edit-route-select",
  onEnter() {},
  onLeave() {},

  onRouteDown(e) {
    if (!isPrimaryMouseButton(e)) return;
    const props = e.features[0].properties;
    const routeId = props.route_id;
    popupRoute(e.lngLat, props.subroute_id, e.point);
    if (!routeId) return;

    Route.clearHover();
    M.suppressNextEditMapClick = true;
    Route.startEditRoute(routeId);
    const map = getMap();
    map.once("mouseup", () => setMode("edit-route-active"));
  },
};

Modes["edit-route-active"] = {
  name: "edit-route-active",
  onEnter() {},
  onLeave() {
    M.suppressNextEditMapClick = false;
  },
  onMapMove: Modes["add-route"].onMapMove,
  onMapClick: onMapClickWhileEditing,
  onTempLineClick: Modes["add-route"].onTempLineClick,
  onTempNodeClick: Modes["add-route"].onTempNodeClick,
  onTempNodeDown: Modes["add-route"].onTempNodeDown,
  onGlobalUp: Modes["add-route"].onGlobalUp,
  onRouteClick: Modes["add-route"].onRouteClick,
};

Modes["edit-station"] = {
  name: "edit-station",
  onEnter() {
    Route.refreshTransferSnapSource();
    onEditStationSubmodeChange(editStationSubmode);
    applyEditStationSubmode();
    Route.clearHover();
  },
  onLeave() {
    const map = getMap();
    if (map) {
      clearLabelDragLimitCircle(map);
      setStationLabelMoveFrameVisibility(false);
      applyStationLabelCollision(map);
    }
    setZoomInteractionsEnabled(true);
    setEditStationSubmodeInternal("station");
  },

  onTransferSnapClick(e) {
    e.preventDefault();
    const feature = e.features?.[0];
    if (!feature || feature.layer?.id !== "transfer-snaps-layer") return;
    const properties = feature.properties;
    if (M.hover.transferSnapId !== (properties.snap_id || "")) return;
    const ridA = properties.subroute_id_a;
    const ridB = properties.subroute_id_b;
    if (ridA && ridB) {
      Route.addTransferStationAt(feature.geometry.coordinates, ridA, ridB);
    }
  },

  onStationClick(e) {
    openStationEditPopupFromClick(e);
  },

  onMapClick(e) {
    const map = getMap();
    const hitFeatures = map.queryRenderedFeatures(e.point, { layers: STATION_EDIT_CLICK_LAYERS });

    if (hitFeatures.length) {
      if (hitFeatures[0].layer?.id === "transfer-snaps-layer") {
        return;
      }

      const topFeature = hitFeatures[0];
      const topLayerId = topFeature.layer.id;
      const properties = topFeature.properties;

      const stationForEdit = editStationSubmode !== "move-label" ? stationFeatureFromMapClick(hitFeatures) : null;
      if (stationForEdit) {
        popupStationForEditing(stationForEdit);
        return;
      }

      switch (topLayerId) {
        case "routes-line": {
          if (addNearbyTransferStationFromClick(e.lngLat, properties.subroute_id)) {
            break;
          }
          const snapped = turf.nearestPointOnLine(getRouteFeature(properties.subroute_id), [e.lngLat.lng, e.lngLat.lat], {
            units: "meters",
          });
          const routeFeature = getRouteFeature(properties.subroute_id);
          const routeColor = routeFeature ? routeFeature.properties.color : null;
          Route.addStationAt(properties.subroute_id, snapped.geometry.coordinates, null, routeColor);
          Route.highlightRoute(properties.subroute_id);
          break;
        }
      }
    }
  },

  onStationDown(e) {
    beginStationPositionDrag(e);
  },

  onStationLabelDown(e) {
    if (editStationSubmode === "move-label") {
      beginStationLabelOnlyDrag(e);
      return;
    }
    beginStationPositionDrag(e);
  },
};

function getRouteFeature(subroute_id) {
  const f = store.subroutesFC.features.find((x) => x.properties.subroute_id === subroute_id);
  return f ? { type: "Feature", geometry: f.geometry, properties: f.properties } : null;
}

function subrouteIdFromStationEvent(e) {
  const stationFeature = e.features?.[0];
  return primarySubrouteIdForStation(stationFeature);
}

Modes.merge = {
  name: "merge",
  onEnter() {
    mergePick.length = 0;
    emitModeHint();
    emitMergePickChange();
  },
  onLeave() {
    mergePick.length = 0;
    emitModeHint();
    emitMergePickChange();
  },

  onRouteClick(e) {
    pickRouteForMerge(e.features[0].properties.subroute_id);
  },

  onStationClick(e) {
    const subrouteId = subrouteIdFromStationEvent(e);
    if (subrouteId) pickRouteForMerge(subrouteId);
  },
};

Modes["split-line"] = {
  name: "split-line",
  onEnter() {},
  onLeave() {},

  onRouteClick(e) {
    pickSubRouteForSplitLine(e.features[0].properties.subroute_id);
  },

  onStationClick(e) {
    const subrouteId = subrouteIdFromStationEvent(e);
    if (subrouteId) pickSubRouteForSplitLine(subrouteId);
  },
};

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
  }
  setMode("general");
  return res;
}

let pointerMoveRaf = null;
let pendingPointerMoveEvent = null;

function flushPointerMoveHandlers() {
  pointerMoveRaf = null;
  const e = pendingPointerMoveEvent;
  pendingPointerMoveEvent = null;
  if (!e) return;
  setCursorForMode(e);
  updateHoverFromPointer(e);
}

function schedulePointerMoveHandlers(e) {
  pendingPointerMoveEvent = e;
  if (pointerMoveRaf !== null) return;
  pointerMoveRaf = requestAnimationFrame(flushPointerMoveHandlers);
}

export function initializeEventListeners() {
  const map = getMap();
  if (!map || map.__metroListenersBound) return;
  map.__metroListenersBound = true;

  map.on("mousedown", (e) => {
    if (!isPrimaryMouseButton(e)) return;
    M.pointer.isDown = true;
  });
  map.on("mouseup", () => {
    M.pointer.isDown = false;
  });

  map.on("mousemove", (e) => {
    cur()?.onMapMove?.(e);
    schedulePointerMoveHandlers(e);
  });
  map.on("mouseleave", () => clearHoverAndPopups());

  map.on("click", (e) => cur()?.onMapClick?.(e));
  map.on("click", "routes-line", (e) => cur()?.onRouteClick?.(e));
  map.on("click", "transfer-snaps-layer", (e) => cur()?.onTransferSnapClick?.(e));
  map.on("click", "stations-circle", (e) => cur()?.onStationClick?.(e));
  map.on("click", "transfer-stations-circle", (e) => cur()?.onStationClick?.(e));
  map.on("click", "stations-label", (e) => cur()?.onStationClick?.(e));
  map.on("click", "stations-label-hover", (e) => cur()?.onStationClick?.(e));
  map.on("click", "temp-edit-line-layer", (e) => cur()?.onTempLineClick?.(e));
  map.on("click", TEMP_EDIT_LINE_HIT_LAYER, (e) => cur()?.onTempLineClick?.(e));

  map.on("mousedown", "routes-line", (e) => cur()?.onRouteDown?.(e));
  map.on("mousedown", "temp-edit-nodes-layer", (e) => cur()?.onTempNodeDown?.(e));
  map.on("mousedown", "stations-circle", (e) => cur()?.onStationDown?.(e));
  map.on("mousedown", "transfer-stations-circle", (e) => cur()?.onStationDown?.(e));
  map.on("mousedown", "stations-label", (e) => cur()?.onStationLabelDown?.(e));
  map.on("mousedown", "stations-label-hover", (e) => cur()?.onStationLabelDown?.(e));
  updateTransferSnapVisibility();
}
