import { getMap } from "../mapInstance.js";
import { hasLayer, queryRenderedFeatures, setMapCanvasCursor } from "../../map-runtime/mapEngine.js";
import { applyStationLabelDragPlacement } from "../stationLabelCollision.js";
import {
  clearTransferAbsorbZoneHoverFilter,
  setStationHoverPairFilters,
  setTransferAbsorbZoneHoverFilter,
} from "../mapHoverFilters.js";
import { Route, STATION_NAME_MAX_LEN } from "../routeModel.js";
import { TRANSFER_ABSORB_METERS } from "../transferAbsorbConfig.js";
import {
  findNearestUnoccupiedTransferSnap,
  isTransferSnapOccupied,
  resolveTransferSnapCenter,
  TRANSFER_SNAP_CLICK_METERS,
} from "../routeTransferSnap.js";
import {
  findStationById,
  findStationsNearCoord,
  findSubrouteBySubrouteId,
  getSubrouteFeatures,
} from "../../data/routeQueries.js";
import { resolveRouteDisplayNameFromProps, resolveStationDisplayName } from "../defaultNames.js";
import { t } from "../../i18n/i18n.js";
import {
  closeStationEditPopup,
  hideHoverPopups,
  hideRouteHoverPopup,
  hideStationBrowsePopup,
  hideTransferSnapHint,
  isBrowseHoverMode,
  isStationEditPopupOpen,
  bindStationEditPopupHandlers,
  openStationEditPopup,
  showRouteHoverPopup,
  showTransferSnapHint,
  showStationBrowsePopup,
} from "../mapPopups.js";
import {
  getEditStationSubmode,
  HOVER_PICK_LAYERS,
  M,
  STATION_CIRCLE_LAYERS,
  STATION_LABEL_LAYERS,
  TEMP_EDIT_LINE_HIT_LAYER,
} from "./state.js";
import { primarySubrouteIdForStation } from "./layers.js";

let lastStationEditPopupKey = "";
let lastStationEditPopupAt = 0;
const STATION_EDIT_POPUP_BURST_MS = 80;

export function resetStationEditPopupState() {
  lastStationEditPopupKey = "";
  lastStationEditPopupAt = 0;
}

function setCursor(style) {
  const map = getMap();
  if (map) setMapCanvasCursor(map, style || "");
}

export function isDraftingHoverMode(mode = M.mode) {
  return mode === "add-route" || mode === "edit-route-active";
}

export function shouldSkipPointerHoverWork() {
  if (M.dragging.type) return true;
  if (M.pointer.isDown) return true;
  const map = getMap();
  if (!map) return false;
  if (typeof map.isMoving === "function" && map.isMoving()) return true;
  if (map.dragPan && typeof map.dragPan.isActive === "function" && map.dragPan.isActive()) return true;
  return false;
}

function draftingCursorLayers(map) {
  const tempLineLayers = hasLayer(map, TEMP_EDIT_LINE_HIT_LAYER)
    ? [TEMP_EDIT_LINE_HIT_LAYER]
    : ["temp-edit-line-layer"];
  return ["temp-edit-nodes-layer", ...STATION_CIRCLE_LAYERS, "routes-line", ...tempLineLayers];
}

function cursorForDraftingPoint(map, point) {
  const hits = queryRenderedFeatures(map, point, { layers: draftingCursorLayers(map) });
  if (!hits.length) return "crosshair";
  const layerId = hits[0].layer?.id;
  if (layerId === "temp-edit-nodes-layer") return "grab";
  if (STATION_CIRCLE_LAYERS.includes(layerId)) return "pointer";
  if (layerId === "routes-line") return "pointer";
  if (layerId === TEMP_EDIT_LINE_HIT_LAYER || layerId === "temp-edit-line-layer") return "pointer";
  return "crosshair";
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

const TRANSFER_ABSORB_ZONE_PICK_LAYERS = [
  "transfer-absorb-zones-layer",
  "transfer-absorb-zones-outline-layer",
  "transfer-absorb-zones-hover-layer",
  "transfer-absorb-zones-hover-outline-layer",
];

function isAbsorbZoneLayerId(layerId) {
  return TRANSFER_ABSORB_ZONE_PICK_LAYERS.includes(layerId);
}

function findAbsorbZoneFeatureAtPoint(map, point) {
  const layers = TRANSFER_ABSORB_ZONE_PICK_LAYERS.filter((id) => hasLayer(map, id));
  if (!layers.length) return null;
  const hits = queryRenderedFeatures(map, point, { layers });
  return hits.find((h) => isAbsorbZoneLayerId(h.layer?.id)) || null;
}

function pickHoverTarget(map, point) {
  const hits = queryRenderedFeatures(map, point, { layers: HOVER_PICK_LAYERS });
  if (!hits.length) return null;

  const snapHit = hits.find((h) => h.layer?.id === "transfer-snaps-layer");
  if (snapHit) return { type: "transfer-snap", feature: snapHit };

  const absorbHit = hits.find((h) => isAbsorbZoneLayerId(h.layer?.id));
  if (absorbHit) return { type: "absorb-zone", feature: absorbHit };

  const layerId = hits[0].layer?.id;
  if (isStationHoverLayerId(layerId)) return { type: "station", feature: hits[0] };
  if (layerId === "routes-line") return { type: "route", feature: hits[0] };
  return null;
}

export function transferSnapCenterFromAbsorbZoneFeature(feature) {
  return resolveTransferSnapCenter(feature);
}

function isTransferAddClickLayerId(layerId) {
  return layerId === "transfer-snaps-layer" || layerId === "routes-line" || isAbsorbZoneLayerId(layerId);
}

export function refreshTransferCandidateLayers() {
  Route.ensureTransferSnapSourceReady();
  Route.ensureAbsorbZonesSourceReady();
}

/** 從地圖點擊解析轉乘候選（黃圈／小黃點／圈內路線）。 */
export function resolveTransferSnapCandidateFromMapClick(map, point, lngLat, topLayerId) {
  if (!map || getEditStationSubmode() !== "crud") return null;
  if (!isTransferAddClickLayerId(topLayerId)) return null;

  if (isAbsorbZoneLayerId(topLayerId)) {
    const absorbFeature = findAbsorbZoneFeatureAtPoint(map, point);
    if (absorbFeature && !isTransferSnapOccupied(absorbFeature)) {
      const center = resolveTransferSnapCenter(absorbFeature);
      const ridA = absorbFeature.properties?.subroute_id_a;
      const ridB = absorbFeature.properties?.subroute_id_b;
      if (center && ridA && ridB) {
        return {
          center,
          ridA,
          ridB,
          snapId: absorbFeature.properties?.snap_id || "",
        };
      }
    }
  }

  if (topLayerId === "transfer-snaps-layer") {
    const hits = queryRenderedFeatures(map, point, { layers: ["transfer-snaps-layer"] });
    const snap = hits[0];
    if (snap && !isTransferSnapOccupied(snap)) {
      const center = resolveTransferSnapCenter(snap);
      const ridA = snap.properties?.subroute_id_a;
      const ridB = snap.properties?.subroute_id_b;
      if (center && ridA && ridB) {
        return {
          center,
          ridA,
          ridB,
          snapId: snap.properties?.snap_id || "",
        };
      }
    }
  }

  if (topLayerId === "routes-line") {
    const snapNear = findNearestUnoccupiedTransferSnap(lngLat, TRANSFER_ABSORB_METERS);
    if (snapNear) {
      const p = snapNear.feature.properties;
      return {
        center: snapNear.feature.geometry.coordinates,
        ridA: p.subroute_id_a,
        ridB: p.subroute_id_b,
        snapId: p.snap_id || "",
      };
    }
  }

  return null;
}

function tryApplyTransferSnapCandidateHoverAtPointer(map, e, target) {
  if (getEditStationSubmode() !== "crud") return false;
  if (target?.type === "transfer-snap") {
    return applyTransferSnapCandidateHover(map, target.feature, e.point);
  }
  const absorbFeature = findAbsorbZoneFeatureAtPoint(map, e.point);
  if (absorbFeature) {
    return applyTransferSnapCandidateHover(map, absorbFeature, e.point);
  }
  const snapInZone = findNearestUnoccupiedTransferSnap(e.lngLat, TRANSFER_ABSORB_METERS);
  if (snapInZone) {
    return applyTransferSnapCandidateHover(map, snapInZone.feature, e.point);
  }
  return false;
}

/** 轉乘候選點 hover：黃色圈圈高亮 +「新增轉乘站」提示同時出現。 */
function applyTransferSnapCandidateHover(map, snapFeature, cursorPoint) {
  if (!map || !snapFeature) return false;
  if (isTransferSnapOccupied(snapFeature)) {
    M.hover.transferSnapId = "";
    clearTransferAbsorbZoneHoverFilter(map);
    hideTransferSnapHint();
    return false;
  }

  const snapId = snapFeature.properties?.snap_id || "";
  const center = resolveTransferSnapCenter(snapFeature);
  if (!snapId || !center) return false;

  M.hover.stationId = "";
  M.hover.subrouteId = "";
  M.hover.transferSnapId = snapId;
  setStationHoverPairFilters(map, "");
  setTransferAbsorbZoneHoverFilter(map, snapId);
  hideStationBrowsePopup();
  showTransferSnapHint(center, snapId, cursorPoint);
  return true;
}

export function clearStationHoverHighlight() {
  M.hover.stationId = "";
  setStationHoverPairFilters(getMap(), "");
  clearTransferAbsorbZoneHoverFilter(getMap());
}

export function setCursorForMode(e) {
  const map = getMap();
  if (!map) return;
  const editStationSubmode = getEditStationSubmode();
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
    if (shouldSkipPointerHoverWork()) {
      const panning = M.pointer.isDown || (map.dragPan && map.dragPan.isActive && map.dragPan.isActive());
      setCursor(panning ? "grabbing" : "crosshair");
      return;
    }
    cursor = e ? cursorForDraftingPoint(map, e.point) : "crosshair";
  } else if (M.mode === "edit-station") {
    cursor = "";
    if (e) {
      const onRoute = queryRenderedFeatures(map, e.point, { layers: ["routes-line"] });
      const onStation = queryRenderedFeatures(map, e.point, { layers: STATION_CIRCLE_LAYERS });
      const onStationLabel = queryRenderedFeatures(map, e.point, {
        layers: [...STATION_LABEL_LAYERS, "stations-label-hover"],
      });
      const onSnap = queryRenderedFeatures(map, e.point, { layers: ["transfer-snaps-layer"] });
      const onAbsorbZone = queryRenderedFeatures(map, e.point, {
        layers: TRANSFER_ABSORB_ZONE_PICK_LAYERS.filter((id) => hasLayer(map, id)),
      });
      switch (editStationSubmode) {
        case "crud":
          if (onSnap.length || onRoute.length || onAbsorbZone.length) cursor = "pointer";
          if (onStation.length || onStationLabel.length) cursor = "grab";
          break;
        case "move-label":
          if (onStationLabel.length) cursor = "grab";
          break;
        default:
          break;
      }
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
  if (map && M.mode === "edit-station" && getEditStationSubmode() === "move-label") {
    applyStationLabelDragPlacement(map);
  }
  clearTransferAbsorbZoneHoverFilter(map);
  hideHoverPopups();
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
  return findStationById(sid) || stationFeature;
}

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
    for (const feature of findStationsNearCoord(anchorCoord, 10)) {
      addFromStation(feature);
    }
  }
  return ids;
}

export function addNearbyTransferStationFromClick(lngLat, highlightSubrouteId = "") {
  const snapNear = findNearestUnoccupiedTransferSnap(lngLat, TRANSFER_SNAP_CLICK_METERS);
  if (!snapNear) return false;
  const p = snapNear.feature.properties;
  Route.addTransferStationAt(snapNear.feature.geometry.coordinates, p.subroute_id_a, p.subroute_id_b);
  if (highlightSubrouteId) Route.highlightRoute(highlightSubrouteId);
  suppressUiAfterTransferAdd();
  return true;
}

/** 新增轉乘站後：清 hover 提示並立即刷新候選點／黃圈。 */
export function suppressUiAfterTransferAdd() {
  closeStationEditPopup();
  hideTransferSnapHint();
  M.hover.transferSnapId = "";
  clearTransferAbsorbZoneHoverFilter(getMap());
  refreshTransferCandidateLayers();
}

function isStationLayerId(layerId) {
  return (
    layerId === "stations-circle" ||
    layerId === "transfer-stations-circle" ||
    layerId === "stations-label" ||
    layerId === "stations-label-hover"
  );
}

export function stationEditClickLayers() {
  switch (getEditStationSubmode()) {
    case "crud":
      return [
        "transfer-absorb-zones-hover-layer",
        "transfer-absorb-zones-hover-outline-layer",
        "transfer-absorb-zones-layer",
        "transfer-snaps-layer",
        ...STATION_CIRCLE_LAYERS,
        ...STATION_LABEL_LAYERS,
        "stations-label-hover",
        "routes-line",
      ];
    default:
      return [];
  }
}

export function stationFeatureFromMapClick(hitFeatures) {
  if (!hitFeatures?.length) return null;
  const hovered = findHoveredStationFeature(hitFeatures);
  if (hovered) return hovered;
  return hitFeatures.find((f) => isStationLayerId(f.layer?.id) && f.properties?.station_id) || null;
}

function findHoveredStationFeature(hitFeatures) {
  if (!M.hover.stationId) return null;
  return hitFeatures.find(
    (feature) => isStationLayerId(feature.layer?.id) && feature.properties?.station_id === M.hover.stationId,
  );
}

function buildPassingRouteLabels(passingSubrouteIds) {
  const labels = [];
  const seenRouteIds = new Set();
  for (const subrouteId of passingSubrouteIds) {
    const feature = findSubrouteBySubrouteId(subrouteId);
    if (!feature) continue;
    const routeId = feature.properties.route_id;
    if (routeId && seenRouteIds.has(routeId)) continue;
    if (routeId) seenRouteIds.add(routeId);
    labels.push(resolveRouteDisplayNameFromProps(feature.properties));
  }
  return labels;
}

export function popupRoute(lngLat, subrouteId, point) {
  showRouteHoverPopup(lngLat, subrouteId, point, { routes: getSubrouteFeatures() });
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
  const stationId = station.properties?.station_id ?? "";
  const now = performance.now();
  if (stationId && isStationEditPopupOpen() && stationId === lastStationEditPopupKey) return;
  if (stationId && stationId === lastStationEditPopupKey && now - lastStationEditPopupAt < STATION_EDIT_POPUP_BURST_MS) {
    return;
  }
  lastStationEditPopupKey = stationId;
  lastStationEditPopupAt = now;
  hideRouteHoverPopup();
  hideStationBrowsePopup();
  hideTransferSnapHint();
  const p = station.properties;
  const currentName = resolveStationDisplayName(p);
  const safeName = escapeHtmlAttr(currentName);
  const html = `
    <div class="station-edit-popup__body map-hover-popup__body">
      <div class="station-edit-popup__header">
        <span class="station-edit-popup__title">${t("popup.editStationTitle")}</span>
        <span id="station-name-count" class="station-edit-popup__count" aria-live="polite">${currentName.length}/${STATION_NAME_MAX_LEN}</span>
      </div>
      <input type="text" id="station-name-input" class="station-edit-popup__input" value="${safeName}" maxlength="${STATION_NAME_MAX_LEN}" autocomplete="off" spellcheck="false" aria-label="${escapeHtmlAttr(t("popup.editStationTitle"))}" />
      <div class="station-edit-popup__actions">
        <button type="button" id="delete-station-btn" class="station-edit-popup__btn station-edit-popup__btn--danger">${t("popup.delete")}</button>
        <button type="button" id="save-station-btn" class="station-edit-popup__btn station-edit-popup__btn--primary">${t("popup.save")}</button>
      </div>
    </div>
  `;
  openStationEditPopup(station.geometry.coordinates, html);
  let deleteConfirmOpen = false;
  bindStationEditPopupHandlers({
    nameMaxLen: STATION_NAME_MAX_LEN,
    onSave: (name) => {
      Route.setStationName(p.station_id, name);
      closeStationEditPopup();
    },
    onDelete: () => {
      if (deleteConfirmOpen) return;
      deleteConfirmOpen = true;
      try {
        if (confirm(t("popup.confirmDeleteStation", { name: currentName }))) {
          Route.removeStation(p.station_id);
          closeStationEditPopup();
          refreshTransferCandidateLayers();
        }
      } finally {
        deleteConfirmOpen = false;
      }
    },
  });
}

function applyBrowseRouteHover(lngLat, routeFeature, point) {
  const rid = routeFeature.properties.subroute_id;
  const routeId = routeFeature.properties.route_id || "";
  const prevRoute = M.hover.subrouteId ? findSubrouteBySubrouteId(M.hover.subrouteId) : null;
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
  const editStationSubmode = getEditStationSubmode();
  if (editStationSubmode === "move-label") return;
  if (isStationEditPopupOpen()) return;
  if (M.pointer.isDown) return;
  if (M.dragging.type === "station" || M.dragging.type === "station-label") return;
  const map = getMap();
  if (!target) {
    if (tryApplyTransferSnapCandidateHoverAtPointer(map, e, null)) return;
    clearHoverAndPopups();
    return;
  }
  if (tryApplyTransferSnapCandidateHoverAtPointer(map, e, target)) {
    return;
  }
  if (target.type === "station") {
    const st = target.feature;
    const sid = st.properties.station_id;
    const rid = primarySubrouteIdForStation(st);
    if (M.hover.stationId === sid && M.hover.subrouteId === rid) {
      hideTransferSnapHint();
      return;
    }
    M.hover.stationId = sid;
    M.hover.subrouteId = rid || "";
    M.hover.transferSnapId = "";
    setStationHoverPairFilters(map, sid);
    clearTransferAbsorbZoneHoverFilter(map);
    hideStationBrowsePopup();
    hideTransferSnapHint();
    return;
  }
  const rid = target.feature.properties.subroute_id;
  const sameRoute = M.hover.subrouteId === rid;
  M.hover.subrouteId = rid;
  M.hover.stationId = "";
  M.hover.transferSnapId = "";
  clearTransferAbsorbZoneHoverFilter(getMap());
  if (!sameRoute) Route.highlightRoute(rid);
  hideStationBrowsePopup();
  hideTransferSnapHint();
}

export function updateHoverFromPointer(e) {
  if (M.dragging.type) return;
  const map = getMap();
  if (!map) return;
  if (isDraftingHoverMode() && shouldSkipPointerHoverWork()) return;
  const target = pickHoverTarget(map, e.point);
  if (isBrowseHoverMode()) {
    if (M.pointer.isDown) return;
    if (!target) {
      clearHoverAndPopups();
      return;
    }
    if (target.type === "station") applyBrowseStationHover(e.lngLat, target.feature, e.point);
    else applyBrowseRouteHover(e.lngLat, target.feature, e.point);
    return;
  }
  if (isDraftingHoverMode()) {
    applyDraftingHover(target);
    return;
  }
  if (M.mode === "edit-station") updateEditStationHover(e, target);
}
