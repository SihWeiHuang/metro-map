import * as turf from "@turf/turf";
import { getMap } from "./mapInstance.js";
import { ensureMetroLayerStackOrder } from "./layers.js";
import { nearestPointOnSmoothedRoute } from "./displayLineSmoothing.js";
import { setStationHoverPairFilters } from "./mapHoverFilters.js";
import {
  Route,
  store,
  findNearestTransferSnap,
  isTransferSnapOccupied,
  TRANSFER_SNAP_HOVER_METERS,
  TRANSFER_SNAP_CLICK_METERS,
} from "./routeModel.js";
import {
  clearLabelDragLimitCircle,
  drawLabelDragLimitCircle,
  getDisplayedStationCenter,
  setStationLabelPreviewCoord,
  setStationPreviewCoord,
} from "./stationPreview.js";
import { t } from "../i18n/i18n.js";
import { resolveLineDisplayNameFromProps, resolveStationDisplayName } from "./defaultNames.js";
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

export function getMergePickRouteIds() {
  return [...mergePick];
}

/** @returns {{ picked: boolean, merged?: boolean, ok?: boolean, msg?: string }} */
export function pickRouteForMerge(routeId) {
  if (M.mode !== "merge" || typeof routeId !== "string") return { picked: false };
  if (!mergePick.includes(routeId)) mergePick.push(routeId);
  Route.highlightRoute(routeId);
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
    routeId: null,
    isClickCandidate: false,
    downPoint: null,
  },
  pointer: { isDown: false },
  hover: { routeId: "", stationId: "" },
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

initMapPopups({
  getMap,
  getContext: () => ({
    mode: M.mode,
    editStationSubmode,
    draggingType: M.dragging.type,
  }),
});

const STATION_CIRCLE_LAYERS = ["stations-circle", "transfer-stations-circle"];
const HOVER_PICK_LAYERS = [...STATION_CIRCLE_LAYERS, "stations-label", "transfer-snaps-layer", "routes-line"];

let tempNodePreviewRaf = null;
let stationDragPreviewRaf = null;

const cur = () => Modes[M.mode];

function getModeHintText() {
  switch (M.mode) {
    case "general":
      return t("modeHint.general");
    case "add-route":
      return t("modeHint.addRoute");
    case "edit-route-select":
      return t("modeHint.editRouteSelect");
    case "edit-route-active":
      return t("modeHint.editRouteActive");
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
      map.setFilter("routes-line-hover", ["==", ["get", "route_id"], ""]);
    }
    if (map.getLayer("stations-circle-hover")) {
      map.setFilter("stations-circle-hover", ["==", ["get", "station_id"], ""]);
    }
    if (map.getLayer("transfer-stations-circle-hover")) {
      map.setFilter("transfer-stations-circle-hover", ["==", ["get", "station_id"], ""]);
    }
    setStationLabelMoveFrameVisibility(true);
    if (map.getLayer("stations-label")) {
      map.setLayoutProperty("stations-label", "text-allow-overlap", true);
      map.setLayoutProperty("stations-label", "text-ignore-placement", true);
    }
  } else {
    setStationLabelMoveFrameVisibility(false);
    if (map.getLayer("stations-label") && M.dragging.type !== "station") {
      map.setLayoutProperty("stations-label", "text-allow-overlap", false);
      map.setLayoutProperty("stations-label", "text-ignore-placement", false);
    }
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
            const onTempLine = map.queryRenderedFeatures(e.point, { layers: ["temp-edit-line-layer"] });
            if (onTempLine.length) cursor = "pointer";
          }
        }
      }
    }
  } else if (M.mode === "edit-station") {
    cursor = "grab";
    if (e) {
      const onRoute = map.queryRenderedFeatures(e.point, { layers: ["routes-line"] });
      const onStation = map.queryRenderedFeatures(e.point, { layers: STATION_CIRCLE_LAYERS });
      const onStationLabel = map.queryRenderedFeatures(e.point, { layers: ["stations-label"] });
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
  M.hover.routeId = "";
  M.hover.stationId = "";
  Route.clearHover();
  hideHoverPopups();
}

function clearStationHoverHighlight() {
  M.hover.stationId = "";
  setStationHoverPairFilters(getMap(), "");
}

function isDraftingHoverMode(mode = M.mode) {
  return mode === "add-route" || mode === "edit-route-active";
}

function pickHoverTarget(map, point) {
  const hits = map.queryRenderedFeatures(point, { layers: HOVER_PICK_LAYERS });
  if (!hits.length) return null;
  const top = hits[0];
  const layerId = top.layer.id;
  if (layerId === "stations-circle" || layerId === "transfer-stations-circle" || layerId === "stations-label") {
    return { type: "station", feature: top };
  }
  if (layerId === "transfer-snaps-layer") {
    return { type: "transfer-snap", feature: top };
  }
  if (layerId === "routes-line") {
    return { type: "route", feature: top };
  }
  return null;
}

function primaryRouteIdForStation(stationFeature) {
  const routeId = stationFeature?.properties?.route_id;
  if (routeId) return routeId;
  const transferRoutes = stationFeature?.properties?.transfer_routes;
  if (Array.isArray(transferRoutes) && transferRoutes.length > 0) return transferRoutes[0];
  return "";
}

function applyBrowseRouteHover(lngLat, routeFeature, point) {
  const rid = routeFeature.properties.route_id;
  const sameRoute = M.hover.routeId === rid && M.hover.stationId === "";
  M.hover.routeId = rid;
  M.hover.stationId = "";
  if (!sameRoute) Route.highlightRoute(rid);
  hideStationBrowsePopup();
  popupRoute(lngLat, rid, point);
}

function applyBrowseStationHover(lngLat, stationFeature, point) {
  const sid = stationFeature.properties.station_id;
  const rid = primaryRouteIdForStation(stationFeature);
  if (!rid) return;
  if (M.hover.stationId === sid && M.hover.routeId === rid) return;
  M.hover.stationId = sid;
  M.hover.routeId = rid;
  Route.highlightRoute(rid);
  hideStationBrowsePopup();
  popupRoute(lngLat, rid, point);
}

function applyDraftingHover(target) {
  if (target?.type !== "station") return;
  if (!M.hover.routeId && !M.hover.stationId) return;
  M.hover.routeId = "";
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
    const rid = primaryRouteIdForStation(st);
    const map = getMap();
    if (M.hover.stationId === sid && M.hover.routeId === rid) {
      hideTransferSnapHint();
      return;
    }
    M.hover.stationId = sid;
    M.hover.routeId = rid || "";
    setStationHoverPairFilters(map, sid);
    hideStationBrowsePopup();
    hideTransferSnapHint();
    return;
  }

  if (target.type === "transfer-snap") {
    if (!isTransferSnapOccupied(target.feature)) {
      hideStationBrowsePopup();
      refreshEditStationTransferHint(e.lngLat, TRANSFER_SNAP_HINT_DEPS, { feature: target.feature });
    }
    return;
  }

  const rid = target.feature.properties.route_id;
  if (snapActive) {
    if (M.hover.routeId !== rid) {
      M.hover.routeId = rid;
      Route.highlightRoute(rid);
    }
    hideStationBrowsePopup();
    refreshEditStationTransferHint(e.lngLat, TRANSFER_SNAP_HINT_DEPS, snapNear);
    return;
  }

  const sameRoute = M.hover.routeId === rid;
  M.hover.routeId = rid;
  if (!sameRoute) Route.highlightRoute(rid);
  hideStationBrowsePopup();
  refreshEditStationTransferHint(e.lngLat, TRANSFER_SNAP_HINT_DEPS, null);
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

export function popupRoute(lngLat, routeId, point) {
  showRouteHoverPopup(lngLat, routeId, point, { routes: store.routesFC.features });
}

function addRouteIdToSet(ids, routeId) {
  if (routeId == null || routeId === "") return;
  ids.add(String(routeId));
}

function collectRouteIdsForStation(station) {
  const ids = new Set();
  addRouteIdToSet(ids, station?.properties?.route_id);
  const transferRoutes = station?.properties?.transfer_routes;
  if (Array.isArray(transferRoutes)) {
    transferRoutes.forEach((rid) => addRouteIdToSet(ids, rid));
  }
  return ids;
}

function resolveStoreStation(stationFeature) {
  const sid = stationFeature?.properties?.station_id;
  if (typeof sid !== "string") return stationFeature;
  return store.stationsFC.features.find((f) => f.properties?.station_id === sid) || stationFeature;
}

/** 彙整 hover 車站經過的路線 id（含 store 完整屬性與近距離共點）。 */
function collectPassingRouteIdsForPopup(hoveredFeature) {
  const ids = new Set();
  const storeStation = resolveStoreStation(hoveredFeature);

  const addFromStation = (station) => {
    collectRouteIdsForStation(station).forEach((rid) => ids.add(rid));
  };

  addFromStation(hoveredFeature);
  addFromStation(storeStation);

  const anchorCoord = storeStation?.geometry?.coordinates || hoveredFeature?.geometry?.coordinates;
  if (anchorCoord) {
    const coincidentRadiusMeters = 10;
    for (const feature of store.stationsFC.features) {
      const distance = turf.distance(feature.geometry.coordinates, anchorCoord, { units: "meters" });
      if (distance <= coincidentRadiusMeters) addFromStation(feature);
    }
  }

  return ids;
}

function collectLineNamesForSubRouteIds(subRouteIds) {
  const lines = new Map();
  subRouteIds.forEach((subRouteId) => {
    const parentSubRoute = store.routesFC.features.find((f) => f.properties.route_id === subRouteId);
    if (!parentSubRoute) return;
    const lineId = parentSubRoute.properties.group_id;
    if (typeof lineId !== "string" || lines.has(lineId)) return;
    const firstSubRouteInLine = store.routesFC.features.find((f) => f.properties.group_id === lineId);
    const lineDisplayName = resolveLineDisplayNameFromProps(firstSubRouteInLine?.properties);
    lines.set(lineId, lineDisplayName);
  });
  return lines;
}

/** 車站 popup 顯示用的路線名稱（至少一條）。 */
function buildPassingRouteLabels(passingRouteIds) {
  const fromLines = Array.from(collectLineNamesForSubRouteIds(passingRouteIds).values());
  if (fromLines.length > 0) return fromLines;
  return [...passingRouteIds].map((rid) => {
    const route = store.routesFC.features.find((f) => f.properties.route_id === rid);
    if (route?.properties?.group_id) {
      const gid = route.properties.group_id;
      const firstInLine = store.routesFC.features.find((f) => f.properties.group_id === gid);
      return resolveLineDisplayNameFromProps(firstInLine?.properties);
    }
    return resolveLineDisplayNameFromProps(route?.properties);
  });
}

export function popupStation(lngLat, st, point) {
  const p = st.properties;
  const passingRouteIds = collectPassingRouteIdsForPopup(st);
  const routeLabels = buildPassingRouteLabels(passingRouteIds);

  const stationNameHTML = `<div class="map-hover-popup__title">${resolveStationDisplayName(p)}</div>`;
  let lineInfoHTML = "";

  if (routeLabels.length > 0) {
    lineInfoHTML =
      `<div class="map-hover-popup__divider"></div>` +
      `<div class="map-hover-popup__section-label">${t("popup.routesPassingHeader")}</div>` +
      `<ul class="map-hover-popup__list">` +
      routeLabels.map((name) => `<li>${name}</li>`).join("") +
      "</ul>";
  }

  const estHeight = 56 + routeLabels.length * 22;
  const bodyHtml = `<div class="map-hover-popup__body">${stationNameHTML}${lineInfoHTML}</div>`;
  showStationBrowsePopup(lngLat, bodyHtml, point, estHeight);
}

export function popupStationForEditing(station) {
  hideRouteHoverPopup();
  hideStationBrowsePopup();
  hideTransferSnapHint();

  const p = station.properties;
  const currentName = resolveStationDisplayName(p);

  const saveLabel = t("popup.save");
  const deleteLabel = t("popup.delete");
  const html = `
    <div style="font-family: sans-serif; display: flex; flex-direction: column; gap: 8px;">
      <input type="text" id="station-name-input" value="${currentName}" maxlength="15" style="padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
      <div style="display: flex; justify-content: space-between;">
        <button id="save-station-btn" style="padding: 5px 10px; border: none; background-color: #4CAF50; color: white; cursor: pointer;">${saveLabel}</button>
        <button id="delete-station-btn" style="padding: 5px 10px; border: none; background-color: #f44336; color: white; cursor: pointer;">${deleteLabel}</button>
      </div>
    </div>
  `;
  openStationEditPopup(station.geometry.coordinates, html);

  setTimeout(() => {
    const input = document.getElementById("station-name-input");
    input?.focus();

    document.getElementById("save-station-btn")?.addEventListener("click", () => {
      Route.setStationName(p.station_id, input.value);
      closeStationEditPopup();
    });

    document.getElementById("delete-station-btn")?.addEventListener("click", () => {
      if (confirm(t("popup.confirmDeleteStation", { name: currentName }))) {
        Route.removeStation(p.station_id);
        closeStationEditPopup();
      }
    });
  }, 0);
}

export function setMode(next) {
  if (M.mode === next) return;
  cur()?.onLeave?.();
  M.mode = next;
  cur()?.onEnter?.();
  setActiveButton();
  onModeChange(next);
  setCursorForMode();
  clearHoverAndPopups();
  if (store.hiddenRouteIds.size > 0 && M.mode !== "edit-route-active") {
    store.hiddenRouteIds.clear();
    Route.refreshSources();
  }
  if (M.mode !== "edit-station") {
    setEditStationSubmodeInternal("station");
    setZoomInteractionsEnabled(true);
  }
  updateTransferSnapVisibility();
  emitModeHint();
  const map = getMap();
  if (map) ensureMetroLayerStackOrder(map);
}

export function startAddRoute() {
  setMode("add-route");
}

export function startEditRoute() {
  setMode("edit-route-select");
}

export function startMergeRoute() {
  setMode("merge");
}

export function startSplitLine() {
  setMode("split-line");
}

export function finishEditing() {
  if (M.mode === "edit-station") {
    const saveBtn = document.getElementById("save-station-btn");
    if (saveBtn) {
      saveBtn.click();
    }
    setMode("general");
    return { ok: true, newLineIds: [] };
  }
  const result = Route.endTempEditingAndCommit();
  if (result.ok) {
    setMode("general");
  }
  return result;
}

export function cancelMerge() {
  setMode("general");
}

function cancelTempRouteEditingSession() {
  if (tempNodePreviewRaf !== null) {
    cancelAnimationFrame(tempNodePreviewRaf);
    tempNodePreviewRaf = null;
  }
  if (M.dragging.type === "temp-node") {
    const map = getMap();
    map?.off("mousemove", onDragMoveAddRoute);
    M.dragging.type = null;
    M.dragging.idx = null;
    M.dragging.routeId = null;
    M.dragging.isClickCandidate = false;
    M.dragging.downPoint = null;
  }
  M.suppressNextEditMapClick = false;
  Route.cancelTempEditing();
  setMode("general");
  return { ok: true };
}

/** @deprecated use cancelRouteEditing */
export function cancelAddRoute() {
  if (M.mode !== "add-route") return { ok: false };
  return cancelTempRouteEditingSession();
}

export function cancelEditRoute() {
  if (M.mode !== "edit-route-select" && M.mode !== "edit-route-active") return { ok: false };
  return cancelTempRouteEditingSession();
}

export function cancelRouteEditing() {
  if (
    M.mode !== "add-route" &&
    M.mode !== "edit-route-select" &&
    M.mode !== "edit-route-active"
  ) {
    return { ok: false };
  }
  return cancelTempRouteEditingSession();
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
          routeId: session.routeId,
          insertAtStart,
        };
      }
    });

    if (!best) {
      Route.addTempNodeAt(coord, sessions[0].routeId);
      return;
    }
    if (best.insertAtStart) {
      Route.addTempNodeAt(coord, best.routeId, 0);
    } else {
      Route.addTempNodeAt(coord, best.routeId);
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

  const hitFeatures = map.queryRenderedFeatures(e.point, {
    layers: ["temp-edit-nodes-layer", "temp-edit-line-layer", ...STATION_CIRCLE_LAYERS, "routes-line"],
  });

  if (hitFeatures.length) {
    const topFeature = hitFeatures[0];
    const topLayerId = topFeature.layer.id;
    const properties = topFeature.properties || {};

    switch (topLayerId) {
      case "temp-edit-nodes-layer":
        Route.deleteTempNodeByIndex(properties.idx, properties.route_id);
        return;
      case "temp-edit-line-layer":
        Route.insertTempNodeOnSegment(e.point, properties.route_id);
        return;
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
    Route.updateTempNodeCoord(M.dragging.idx, [e.lngLat.lng, e.lngLat.lat], M.dragging.routeId);
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

function finishTempNodeDrag() {
  if (tempNodePreviewRaf !== null) {
    cancelAnimationFrame(tempNodePreviewRaf);
    tempNodePreviewRaf = null;
  }
  Route.refreshTempEditSources();
  Route.refreshSources();
}

let pendingStationDragPreview = null;

function applyStationDragPreview() {
  if (!pendingStationDragPreview) return;
  const { map, sid, lngLat } = pendingStationDragPreview;
  const st = store.stationsFC.features.find((x) => x.properties.station_id === sid);
  const rid = st?.properties?.route_id;
  const route = rid ? store.routesFC.features.find((x) => x.properties?.route_id === rid) : null;
  if (route?.geometry?.type === "LineString" && route.geometry.coordinates?.length >= 2) {
    const snapped = nearestPointOnSmoothedRoute(route.geometry.coordinates, lngLat);
    setStationPreviewCoord(map, sid, snapped?.geometry?.coordinates || lngLat);
    return;
  }
  setStationPreviewCoord(map, sid, lngLat);
}

function scheduleStationDragPreview(map, sid, lngLat) {
  pendingStationDragPreview = { map, sid, lngLat };
  if (stationDragPreviewRaf !== null) return;
  stationDragPreviewRaf = requestAnimationFrame(() => {
    stationDragPreviewRaf = null;
    applyStationDragPreview();
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
    const hitFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["temp-edit-nodes-layer", "temp-edit-line-layer", ...STATION_CIRCLE_LAYERS, "routes-line"],
    });

    if (hitFeatures.length) {
      const topLayerId = hitFeatures[0].layer.id;
      const properties = hitFeatures[0].properties;

      switch (topLayerId) {
        case "temp-edit-nodes-layer":
          Route.deleteTempNodeByIndex(properties.idx, properties.route_id);
          break;
        case "temp-edit-line-layer":
          Route.insertTempNodeOnSegment(e.point, properties.route_id);
          break;
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
                Route.addTempNodeAt(snapped.geometry.coordinates, session.routeId, 0);
              } else {
                Route.addTempNodeAt(snapped.geometry.coordinates, session.routeId);
              }
            } else {
              Route.addTempNodeAt(snapped.geometry.coordinates, session.routeId);
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
          Route.addTempNodeAt(clickCoord, session.routeId, 0);
        } else {
          Route.addTempNodeAt(clickCoord, session.routeId);
        }
      } else {
        Route.addTempNodeAt(clickCoord, session.routeId);
      }
    }
  },

  onTempNodeDown(e) {
    e.preventDefault();
    e.originalEvent.stopPropagation();
    const f = e.features && e.features[0];
    if (!f) return;

    M.dragging.type = "temp-node";
    M.dragging.idx = f.properties.idx;
    M.dragging.routeId = f.properties.route_id;
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
    const props = e.features[0].properties;
    const lineId = props.group_id;
    popupRoute(e.lngLat, props.route_id, e.point);
    if (!lineId) return;

    Route.clearHover();
    M.suppressNextEditMapClick = true;
    Route.startEditLine(lineId);
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
      if (map.getLayer("stations-label")) {
        map.setLayoutProperty("stations-label", "text-allow-overlap", false);
        map.setLayoutProperty("stations-label", "text-ignore-placement", false);
      }
    }
    setZoomInteractionsEnabled(true);
    setEditStationSubmodeInternal("station");
  },

  onMapMove(e) {
    if (isStationEditPopupOpen()) return;
    scheduleTransferSnapHintUpdate(e.lngLat, TRANSFER_SNAP_HINT_DEPS);
  },

  onMapClick(e) {
    const map = getMap();
    const hitFeatures = map.queryRenderedFeatures(e.point, {
      layers: [...STATION_CIRCLE_LAYERS, "stations-label", "transfer-snaps-layer", "routes-line"],
    });

    if (hitFeatures.length) {
      const topFeature = hitFeatures[0];
      const topLayerId = topFeature.layer.id;
      const properties = topFeature.properties;

      switch (topLayerId) {
        case "stations-circle":
        case "transfer-stations-circle":
          popupStationForEditing(topFeature);
          break;
        case "stations-label":
          if (editStationSubmode !== "move-label") {
            popupStationForEditing(topFeature);
          }
          break;
        case "transfer-snaps-layer": {
          const coord = topFeature.geometry.coordinates;
          const ridA = properties.route_id_a;
          const ridB = properties.route_id_b;
          if (ridA && ridB) {
            Route.addTransferStationAt(coord, ridA, ridB);
          }
          break;
        }
        case "routes-line": {
          const snapNear = findNearestTransferSnap(e.lngLat, TRANSFER_SNAP_CLICK_METERS);
          if (snapNear && !isTransferSnapOccupied(snapNear.feature)) {
            const p = snapNear.feature.properties;
            Route.addTransferStationAt(snapNear.feature.geometry.coordinates, p.route_id_a, p.route_id_b);
            Route.highlightRoute(properties.route_id);
            break;
          }
          const snapped = turf.nearestPointOnLine(getRouteFeature(properties.route_id), [e.lngLat.lng, e.lngLat.lat], {
            units: "meters",
          });
          const routeFeature = getRouteFeature(properties.route_id);
          const routeColor = routeFeature ? routeFeature.properties.color : null;
          Route.addStationAt(properties.route_id, snapped.geometry.coordinates, null, routeColor);
          Route.highlightRoute(properties.route_id);
          break;
        }
      }
    }
  },

  onStationDown(e) {
    e.preventDefault();
    const feature = e.features?.[0];
    if (!feature) return;
    if (feature.properties?.is_transfer_fixed) return;
    const sid = feature.properties.station_id;
    M.dragging.type = "station";
    M.dragging.stationId = sid;

    const map = getMap();
    // Dragging should NOT keep station hover highlight.
    // Clear both station circle + label hover immediately and keep it cleared during drag.
    clearStationHoverHighlight();

    const onDragStation = (ev) => {
      if (M.dragging.type !== "station") return;
      scheduleStationDragPreview(map, sid, [ev.lngLat.lng, ev.lngLat.lat]);
    };

    if (map.getLayer("stations-label")) {
      map.setLayoutProperty("stations-label", "text-allow-overlap", true);
      map.setLayoutProperty("stations-label", "text-ignore-placement", true);
    }
    map.on("mousemove", onDragStation);

    map.once("mouseup", () => {
      map.off("mousemove", onDragStation);
      if (stationDragPreviewRaf !== null) {
        cancelAnimationFrame(stationDragPreviewRaf);
        stationDragPreviewRaf = null;
      }
      if (pendingStationDragPreview?.sid === sid) {
        applyStationDragPreview();
        pendingStationDragPreview = null;
      }
      const finalCoord = getDisplayedStationCenter(map, sid, feature.geometry.coordinates);
      Route.moveStationAlongRoute(sid, finalCoord);
      if (map.getLayer("stations-label")) {
        map.setLayoutProperty("stations-label", "text-allow-overlap", false);
        map.setLayoutProperty("stations-label", "text-ignore-placement", false);
      }
      M.dragging.type = null;
      M.dragging.stationId = null;
      setCursorForMode();
    });
  },

  onStationLabelDown(e) {
    if (editStationSubmode !== "move-label") {
      this.onStationDown(e);
      return;
    }
    e.preventDefault();
    e.originalEvent?.stopPropagation?.();
    const feature = e.features?.[0];
    if (!feature) return;
    const sid = feature.properties.station_id;
    const st = store.stationsFC.features.find((x) => x.properties.station_id === sid);
    if (!st) return;

    const map = getMap();
    M.dragging.type = "station-label";
    M.dragging.stationId = sid;

    setStationHoverPairFilters(map, "");
    if (map.getLayer("stations-label")) {
      map.setLayoutProperty("stations-label", "text-allow-overlap", true);
    }
    const dragCenter = getDisplayedStationCenter(map, sid, st.geometry.coordinates);
    drawLabelDragLimitCircle(map, dragCenter, LABEL_DRAG_RADIUS_METERS);

    let currentLabelCoord = feature.geometry.coordinates;
    const onDragLabel = (ev) => {
      if (M.dragging.type !== "station-label" || M.dragging.stationId !== sid) return;
      const mouseCoord = [ev.lngLat.lng, ev.lngLat.lat];
      const d = turf.distance(turf.point(dragCenter), turf.point(mouseCoord), { units: "meters" });
      if (d <= LABEL_DRAG_RADIUS_METERS) {
        currentLabelCoord = mouseCoord;
        setStationLabelPreviewCoord(map, sid, currentLabelCoord);
        return;
      }
      const bearing = turf.bearing(turf.point(dragCenter), turf.point(mouseCoord));
      const capped = turf.destination(turf.point(dragCenter), LABEL_DRAG_RADIUS_METERS, bearing, { units: "meters" });
      currentLabelCoord = capped.geometry.coordinates;
      setStationLabelPreviewCoord(map, sid, currentLabelCoord);
    };

    map.on("mousemove", onDragLabel);
    map.once("mouseup", () => {
      map.off("mousemove", onDragLabel);
      Route.setStationLabelPosition(sid, currentLabelCoord);
      clearLabelDragLimitCircle(map);
      if (map.getLayer("stations-label")) {
        map.setLayoutProperty("stations-label", "text-allow-overlap", false);
      }
      M.dragging.type = null;
      M.dragging.stationId = null;
      setCursorForMode();
    });
  },
};

function getRouteFeature(route_id) {
  const f = store.routesFC.features.find((x) => x.properties.route_id === route_id);
  return f ? { type: "Feature", geometry: f.geometry, properties: f.properties } : null;
}

function routeIdFromStationEvent(e) {
  const stationFeature = e.features?.[0];
  return primaryRouteIdForStation(stationFeature);
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
    pickRouteForMerge(e.features[0].properties.route_id);
  },

  onStationClick(e) {
    const routeId = routeIdFromStationEvent(e);
    if (routeId) pickRouteForMerge(routeId);
  },
};

Modes["split-line"] = {
  name: "split-line",
  onEnter() {},
  onLeave() {},

  onRouteClick(e) {
    pickSubRouteForSplitLine(e.features[0].properties.route_id);
  },

  onStationClick(e) {
    const routeId = routeIdFromStationEvent(e);
    if (routeId) pickSubRouteForSplitLine(routeId);
  },
};

/** @returns {{ ok: boolean, msg?: string }} */
export function pickSubRouteForSplitLine(routeId) {
  if (M.mode !== "split-line" || typeof routeId !== "string") return { ok: false };
  const res = Route.splitLine(routeId);
  if (!res.ok) alert(res.msg);
  else alert(t("routeModel.splitLineSuccess"));
  setMode("general");
  return res;
}

export function initializeEventListeners() {
  const map = getMap();
  if (!map || map.__metroListenersBound) return;
  map.__metroListenersBound = true;

  map.on("mousedown", () => {
    M.pointer.isDown = true;
  });
  map.on("mouseup", () => {
    M.pointer.isDown = false;
  });

  map.on("mousemove", (e) => {
    setCursorForMode(e);
    cur()?.onMapMove?.(e);
    updateHoverFromPointer(e);
  });
  map.on("mouseleave", () => clearHoverAndPopups());

  map.on("click", (e) => cur()?.onMapClick?.(e));
  map.on("click", "routes-line", (e) => cur()?.onRouteClick?.(e));
  map.on("click", "stations-circle", (e) => cur()?.onStationClick?.(e));
  map.on("click", "transfer-stations-circle", (e) => cur()?.onStationClick?.(e));
  map.on("click", "stations-label", (e) => cur()?.onStationClick?.(e));
  map.on("click", "temp-edit-line-layer", (e) => cur()?.onTempLineClick?.(e));

  map.on("mousedown", "routes-line", (e) => cur()?.onRouteDown?.(e));
  map.on("mousedown", "temp-edit-nodes-layer", (e) => cur()?.onTempNodeDown?.(e));
  map.on("mousedown", "stations-circle", (e) => cur()?.onStationDown?.(e));
  map.on("mousedown", "transfer-stations-circle", (e) => cur()?.onStationDown?.(e));
  map.on("mousedown", "stations-label", (e) => cur()?.onStationLabelDown?.(e));
  updateTransferSnapVisibility();
}

export const ModeCore = {
  M,
  setMode,
  setCursor,
  setCursorForMode,
  clearHoverAndPopups,
  initializeEventListeners,
  popupRoute,
  popupStation,
  popupStationForEditing,
};
