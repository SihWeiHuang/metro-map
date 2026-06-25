/**
 * Central Mapbox popup manager.
 *
 * All map hover / hint popups must go through this module so mode rules stay in one place:
 *
 * | Popup              | Allowed modes                                      |
 * |--------------------|----------------------------------------------------|
 * | Route hover        | general, edit-route-select, merge, split-line      |
 * | Station browse     | general, edit-route-select, merge, split-line      |
 * | Transfer snap hint | edit-station crud; canvas overlay (not Mapbox Popup) |
 * | Station edit       | edit-station (explicit click)                      |
 *
 * edit-station never shows route hover popups (prevents covering transfer snap hints).
 */
import { createMapPopup } from "../map-runtime/mapRuntime.js";
import {
  getMapCanvas,
  getMapCanvasContainer,
  mapOn,
  mapOnce,
  projectMapPoint,
} from "../map-runtime/mapEngine.js";
import { t } from "../i18n/i18n.js";
import { resolveRouteDisplayNameFromProps } from "./defaultNames.js";
import { popupScreenPoint, resolvePopupPlacement } from "./popupPlacement.js";

const MAP_HOVER_POPUP_CLASS = "map-hover-popup";
const STATION_EDIT_POPUP_CLASS = "station-edit-popup map-hover-popup";

/** Caret length toward the snap point (px). */
const TRANSFER_HINT_CARET_PX = 5;
/** Extra space between snap/caret and label (px). */
const TRANSFER_HINT_LABEL_GAP = 6;
const TRANSFER_HINT_EDGE_PAD = 4;
/** Keep label clear of the pointer hotspot. */
const TRANSFER_HINT_CURSOR_RADIUS = 16;

const BROWSE_MODES = new Set(["general", "edit-route-select", "merge", "split-line"]);

/** @typedef {{ mode: string, editStationSubmode: string, draggingType: string | null }} MapPopupContext */

let getMapRef = () => null;
/** @type {() => MapPopupContext} */
let getContext = () => ({ mode: "general", editStationSubmode: "crud", draggingType: null });

const popups = {
  route: null,
  station: null,
};

/** @type {HTMLDivElement | null} */
let transferSnapHintEl = null;
/** @type {import("../map-runtime/mapTypes.js").MapLike | null} */
let transferSnapHintMap = null;

let lastTransferSnapHintId = "";
/** @type {[number, number] | null} */
let lastTransferSnapHintLngLat = null;
/** @type {{ x: number, y: number } | null} */
let lastTransferSnapHintPoint = null;
let transferSnapHoverRaf = null;
/** @type {import("../map-runtime/mapTypes.js").LngLatLike | null} */
let pendingTransferSnapLngLat = null;
/** @type {{ x: number, y: number } | null} */
let pendingTransferSnapPoint = null;

/** @type {WeakSet<import("../map-runtime/mapTypes.js").MapLike>} */
const mapsWithTransferSnapHintHooks = new WeakSet();

export function initMapPopups({ getMap, getContext: readContext }) {
  getMapRef = getMap;
  getContext = readContext;
}

export function isBrowseHoverMode(mode = getContext().mode) {
  return BROWSE_MODES.has(mode);
}

function canShowRouteHoverPopup() {
  return isBrowseHoverMode(getContext().mode);
}

function canShowStationBrowsePopup() {
  return isBrowseHoverMode(getContext().mode);
}

function canShowTransferSnapHint() {
  const ctx = getContext();
  if (ctx.mode !== "edit-station" || ctx.editStationSubmode !== "crud") return false;
  if (ctx.draggingType) return false;
  return true;
}

function mapReadyForSnapHint(map) {
  if (!map?.isStyleLoaded?.()) return false;
  const canvas = getMapCanvas(map);
  return Boolean(canvas?.clientWidth > 0 && canvas.clientHeight > 0);
}

function mapInstance() {
  return getMapRef();
}

export function hideRouteHoverPopup() {
  if (!popups.route) return;
  popups.route.remove();
  popups.route = null;
}

export function hideStationBrowsePopup() {
  if (popups.station && !popups.station.options.closeButton) {
    popups.station.remove();
    popups.station = null;
  }
}

export function hideTransferSnapHint() {
  if (transferSnapHoverRaf !== null) {
    cancelAnimationFrame(transferSnapHoverRaf);
    transferSnapHoverRaf = null;
  }
  pendingTransferSnapLngLat = null;
  disposeTransferSnapHintEl();
  lastTransferSnapHintId = "";
  lastTransferSnapHintLngLat = null;
  lastTransferSnapHintPoint = null;
  pendingTransferSnapPoint = null;
}

function disposeTransferSnapHintEl() {
  if (transferSnapHintEl) {
    transferSnapHintEl.remove();
    transferSnapHintEl = null;
  }
  transferSnapHintMap = null;
}

function transferSnapHintVisible() {
  return Boolean(transferSnapHintEl && !transferSnapHintEl.hidden);
}

/** Route browse + station browse + transfer snap (keeps station edit popup). */
export function hideHoverPopups() {
  hideRouteHoverPopup();
  hideStationBrowsePopup();
  hideTransferSnapHint();
}

export function isStationEditPopupOpen() {
  return Boolean(popups.station?.isOpen?.() && popups.station.options.closeButton);
}

/**
 * 提示框放在游標的對側（遠離指標），箭頭仍指向黃色吸附點。
 * @param {import("../map-runtime/mapTypes.js").MapLike} map
 * @param {[number, number]} lngLat
 * @param {{ x: number, y: number } | undefined} point
 * @returns {"top" | "bottom" | "left" | "right"}
 */
function transferSnapHintAnchor(map, lngLat, point) {
  const snapPx = projectMapPoint(map, lngLat);
  const cursorPx = popupScreenPoint(map, lngLat, point);
  const dx = cursorPx.x - snapPx.x;
  const dy = cursorPx.y - snapPx.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

/**
 * @param {number} left
 * @param {number} top
 * @param {number} w
 * @param {number} h
 * @param {{ x: number, y: number }} cursorPx
 */
function nudgeHintAwayFromCursor(left, top, w, h, cursorPx) {
  const closestX = Math.max(left, Math.min(cursorPx.x, left + w));
  const closestY = Math.max(top, Math.min(cursorPx.y, top + h));
  const dx = cursorPx.x - closestX;
  const dy = cursorPx.y - closestY;
  const distSq = dx * dx + dy * dy;
  const r = TRANSFER_HINT_CURSOR_RADIUS;
  if (distSq >= r * r) return { left, top };

  const dist = Math.sqrt(distSq);
  const push = r - dist + 2;
  const boxCx = left + w / 2;
  const boxCy = top + h / 2;
  let awayX = boxCx - cursorPx.x;
  let awayY = boxCy - cursorPx.y;
  const awayLen = Math.hypot(awayX, awayY);
  if (awayLen < 1) {
    awayX = 0;
    awayY = -1;
  } else {
    awayX /= awayLen;
    awayY /= awayLen;
  }
  return { left: left + awayX * push, top: top + awayY * push };
}

/** @param {import("../map-runtime/mapTypes.js").MapLike} map */
function getTransferSnapHintMount(map) {
  const canvasContainer = getMapCanvasContainer(map);
  const mapRoot = canvasContainer?.parentElement;
  if (mapRoot) return mapRoot;
  return canvasContainer;
}

/** @param {import("../map-runtime/mapTypes.js").MapLike} map */
function ensureTransferSnapHintEl(map) {
  if (transferSnapHintEl && transferSnapHintMap === map && transferSnapHintEl.isConnected) {
    return transferSnapHintEl;
  }
  disposeTransferSnapHintEl();
  const root = document.createElement("div");
  root.className = "transfer-snap-hint";
  root.setAttribute("role", "tooltip");
  root.hidden = true;
  const label = document.createElement("span");
  label.className = "transfer-snap-hint__label";
  root.appendChild(label);
  getTransferSnapHintMount(map).appendChild(root);
  transferSnapHintEl = root;
  transferSnapHintMap = map;
  return root;
}

/** @param {import("../map-runtime/mapTypes.js").PointLike} p */
function isReasonableScreenPoint(p, map) {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  const w = getMapCanvas(map).clientWidth;
  const h = getMapCanvas(map).clientHeight;
  if (w <= 0 || h <= 0) return false;
  return p.x >= -64 && p.x <= w + 64 && p.y >= -64 && p.y <= h + 64;
}

/**
 * @param {import("../map-runtime/mapTypes.js").MapLike} map
 * @param {[number, number]} lngLat
 * @param {{ x: number, y: number } | undefined} point
 */
function layoutTransferSnapHint(map, lngLat, point) {
  const snapPx = projectMapPoint(map, lngLat);
  if (!isReasonableScreenPoint(snapPx, map)) return false;

  const cursorPx = popupScreenPoint(map, lngLat, point);
  const el = ensureTransferSnapHintEl(map);
  const anchor = transferSnapHintAnchor(map, lngLat, point);
  const label = el.querySelector(".transfer-snap-hint__label");
  if (!label) return false;

  el.className = `transfer-snap-hint transfer-snap-hint--${anchor}`;
  label.textContent = t("popup.transferAdd");

  el.hidden = false;
  el.style.visibility = "hidden";
  el.style.left = "0px";
  el.style.top = "0px";

  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const snapOffset = TRANSFER_HINT_CARET_PX + TRANSFER_HINT_LABEL_GAP;
  let left;
  let top;

  switch (anchor) {
    case "left":
      left = snapPx.x + snapOffset;
      top = snapPx.y - h / 2;
      break;
    case "right":
      left = snapPx.x - snapOffset - w;
      top = snapPx.y - h / 2;
      break;
    case "top":
      left = snapPx.x - w / 2;
      top = snapPx.y + snapOffset;
      break;
    default:
      left = snapPx.x - w / 2;
      top = snapPx.y - snapOffset - h;
      break;
  }

  ({ left, top } = nudgeHintAwayFromCursor(left, top, w, h, cursorPx));

  const maxW = getMapCanvas(map).clientWidth;
  const maxH = getMapCanvas(map).clientHeight;
  const pad = TRANSFER_HINT_EDGE_PAD;
  left = Math.max(pad, Math.min(left, maxW - w - pad));
  top = Math.max(pad, Math.min(top, maxH - h - pad));

  ({ left, top } = nudgeHintAwayFromCursor(left, top, w, h, cursorPx));

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.visibility = "visible";
  return true;
}

/** @param {import("../map-runtime/mapTypes.js").LngLatLike | null | undefined} coordinates */
function normalizeSnapHintLngLat(coordinates) {
  if (!coordinates) return null;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
    return null;
  }
  if (typeof coordinates === "object" && "lng" in coordinates && "lat" in coordinates) {
    const lng = Number(coordinates.lng);
    const lat = Number(coordinates.lat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
  }
  return null;
}

/** @param {import("../map-runtime/mapTypes.js").MapLike} map */
function snapHintProjectsOnMap(map, lngLat) {
  const p = projectMapPoint(map, lngLat);
  return isReasonableScreenPoint(p, map);
}

function syncOpenTransferSnapHintPosition() {
  if (!transferSnapHintVisible() || !lastTransferSnapHintLngLat) return;
  if (!canShowTransferSnapHint()) {
    hideTransferSnapHint();
    return;
  }
  const map = mapInstance();
  if (!map || map !== transferSnapHintMap || !mapReadyForSnapHint(map)) {
    hideTransferSnapHint();
    return;
  }
  if (!layoutTransferSnapHint(map, lastTransferSnapHintLngLat, lastTransferSnapHintPoint ?? undefined)) {
    hideTransferSnapHint();
  }
}

/** @param {import("../map-runtime/mapTypes.js").MapLike} map */
function bindTransferSnapHintMapHooks(map) {
  if (mapsWithTransferSnapHintHooks.has(map)) return;
  mapsWithTransferSnapHintHooks.add(map);
  mapOn(map, "resize", syncOpenTransferSnapHintPosition);
  mapOn(map, "move", syncOpenTransferSnapHintPosition);
  mapOn(map, "zoom", syncOpenTransferSnapHintPosition);
  mapOnce(map, "remove", () => {
    if (transferSnapHintMap === map) hideTransferSnapHint();
  });
}

/**
 * @param {[number, number]} coordinates [lng, lat]
 * @param {string} snapId
 * @param {{ x: number, y: number } | undefined} point 游標螢幕座標（用於提示框貼在游標旁）
 */
export function showTransferSnapHint(coordinates, snapId, point) {
  if (!canShowTransferSnapHint()) {
    hideTransferSnapHint();
    return;
  }
  const map = mapInstance();
  if (!map || !mapReadyForSnapHint(map)) return;

  const lngLat = normalizeSnapHintLngLat(coordinates);
  if (!lngLat || !snapHintProjectsOnMap(map, lngLat)) {
    hideTransferSnapHint();
    return;
  }

  lastTransferSnapHintId = snapId || "";
  lastTransferSnapHintLngLat = lngLat;
  lastTransferSnapHintPoint =
    point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;

  hideRouteHoverPopup();
  bindTransferSnapHintMapHooks(map);

  if (!layoutTransferSnapHint(map, lngLat, point)) {
    hideTransferSnapHint();
  }
}

/**
 * @param {import("../map-runtime/mapTypes.js").LngLatLike} lngLat
 * @param {{ findNearest: Function, isOccupied: Function, maxMeters: number }} deps
 */
export function scheduleTransferSnapHintUpdate(lngLat, deps, point) {
  if (!canShowTransferSnapHint()) {
    hideTransferSnapHint();
    return;
  }

  pendingTransferSnapLngLat = lngLat;
  pendingTransferSnapPoint = point ?? null;
  if (transferSnapHoverRaf !== null) return;
  transferSnapHoverRaf = requestAnimationFrame(() => {
    transferSnapHoverRaf = null;
    if (!pendingTransferSnapLngLat) return;
    applyTransferSnapHintUpdate(pendingTransferSnapLngLat, deps, pendingTransferSnapPoint ?? undefined);
  });
}

/**
 * @param {import("../map-runtime/mapTypes.js").LngLatLike} lngLat
 * @param {{ findNearest: Function, isOccupied: Function, maxMeters: number }} deps
 */
export function applyTransferSnapHintUpdate(lngLat, deps, point) {
  if (!canShowTransferSnapHint()) {
    hideTransferSnapHint();
    return;
  }

  const found = deps.findNearest(lngLat, deps.maxMeters);
  if (!found || deps.isOccupied(found.feature)) {
    hideTransferSnapHint();
    return;
  }

  const snapId = found.feature.properties?.snap_id || "";
  showTransferSnapHint(found.feature.geometry.coordinates, snapId, point);
}

/**
 * @param {import("../map-runtime/mapTypes.js").LngLatLike} lngLat
 * @param {string} subrouteId
 * @param {{ x: number, y: number } | undefined} point
 * @param {{ routes: object[] }} data
 */
export function showRouteHoverPopup(lngLat, subrouteId, point, data) {
  if (!canShowRouteHoverPopup()) return;

  const map = mapInstance();
  if (!map) return;

  const currentRoute = data.routes.find((x) => x.properties.subroute_id === subrouteId);
  if (!currentRoute) return;

  const routeId = currentRoute.properties.route_id;
  const headRoute = data.routes.find((f) => f.properties.route_id === routeId);
  const routeDisplayName = resolveRouteDisplayNameFromProps(headRoute?.properties);
  const estHeight = 36;
  const estWidth = Math.min(280, Math.max(120, routeDisplayName.length * 14 + 24));
  const screenPoint = popupScreenPoint(map, lngLat, point);
  const placement = resolvePopupPlacement(map, screenPoint, { estHeight, estWidth });
  const html = `<div class="map-hover-popup__body map-hover-popup__body--route-only"><div class="map-hover-popup__title">${routeDisplayName}</div></div>`;

  hideTransferSnapHint();

  if (popups.route?.isOpen?.()) {
    popups.route.setLngLat(lngLat).setOffset(placement.offset).setHTML(html);
    return;
  }

  if (popups.route) {
    popups.route.remove();
    popups.route = null;
  }

  popups.route = createMapPopup({
    closeButton: false,
    closeOnClick: false,
    anchor: placement.anchor,
    offset: placement.offset,
    className: MAP_HOVER_POPUP_CLASS,
  });
  popups.route.setLngLat(lngLat).setHTML(html).addTo(map);
}

/**
 * @param {import("../map-runtime/mapTypes.js").LngLatLike} lngLat
 * @param {string} bodyHtml inner HTML for `.map-hover-popup__body`
 * @param {{ x: number, y: number } | undefined} point
 * @param {number} estHeight
 */
export function showStationBrowsePopup(lngLat, bodyHtml, point, estHeight) {
  if (!canShowStationBrowsePopup()) return;

  const map = mapInstance();
  if (!map) return;

  hideTransferSnapHint();
  hideRouteHoverPopup();

  const placement = resolvePopupPlacement(map, popupScreenPoint(map, lngLat, point), { estHeight });
  if (popups.station) {
    popups.station.remove();
    popups.station = null;
  }

  popups.station = createMapPopup({
    closeButton: false,
    closeOnClick: false,
    anchor: placement.anchor,
    offset: placement.offset,
    className: MAP_HOVER_POPUP_CLASS,
  });
  popups.station.setLngLat(lngLat).setHTML(bodyHtml).addTo(map);
}

/**
 * @param {import("../map-runtime/mapTypes.js").LngLatLike} lngLat
 * @param {string} html
 */
let stationEditPopupAbort = null;

function teardownStationEditPopupHandlers() {
  stationEditPopupAbort?.abort();
  stationEditPopupAbort = null;
}

export function openStationEditPopup(lngLat, html) {
  hideRouteHoverPopup();
  hideStationBrowsePopup();
  hideTransferSnapHint();
  teardownStationEditPopupHandlers();

  if (popups.station) popups.station.remove();

  popups.station = createMapPopup({
    closeButton: true,
    closeOnClick: false,
    className: STATION_EDIT_POPUP_CLASS,
    maxWidth: "300px",
  });
  popups.station.setLngLat(lngLat).setHTML(html).addTo(mapInstance());
}

/**
 * 在 popup 根節點綁定一次；重開或關閉時會 abort，避免重複 confirm。
 * @param {{ onSave: (name: string) => void, onDelete: () => void, nameMaxLen: number }} handlers
 */
export function bindStationEditPopupHandlers(handlers) {
  teardownStationEditPopupHandlers();

  const popup = popups.station;
  const root = popup?.getElement?.();
  if (!popup || !root) return;

  stationEditPopupAbort = new AbortController();
  const { signal } = stationEditPopupAbort;

  const input = root.querySelector("#station-name-input");
  const saveBtn = root.querySelector("#save-station-btn");
  const deleteBtn = root.querySelector("#delete-station-btn");
  const countEl = root.querySelector("#station-name-count");
  const maxLen = handlers.nameMaxLen;

  const syncNameCount = () => {
    if (!countEl || !input) return;
    const len = input.value.length;
    countEl.textContent = `${len}/${maxLen}`;
    countEl.classList.toggle("station-edit-popup__count--at-limit", len >= maxLen);
  };

  syncNameCount();
  input?.addEventListener("input", syncNameCount, { signal });

  let saveLock = false;
  const onSave = () => {
    if (saveLock) return;
    saveLock = true;
    try {
      handlers.onSave(input?.value ?? "");
    } finally {
      saveLock = false;
    }
  };
  saveBtn?.addEventListener("click", onSave, { signal });
  input?.addEventListener(
    "keydown",
    (ev) => {
      if (ev.key === "Enter") {
        if (ev.isComposing || ev.keyCode === 229) return;
        ev.preventDefault();
        onSave();
      }
    },
    { signal }
  );

  let deleteClickLock = false;
  deleteBtn?.addEventListener(
    "click",
    () => {
      if (deleteClickLock) return;
      deleteClickLock = true;
      try {
        handlers.onDelete();
      } finally {
        deleteClickLock = false;
      }
    },
    { signal, once: true }
  );

  requestAnimationFrame(() => {
    if (signal.aborted) return;
    input?.focus();
    input?.select();
  });
}

export function closeStationEditPopup() {
  teardownStationEditPopupHandlers();
  if (popups.station?.options?.closeButton) {
    popups.station.remove();
    popups.station = null;
  }
}

/** edit-station hover: only transfer snap hint, never route browse popup. */
export function refreshEditStationTransferHint(lngLat, deps, snapNear, point) {
  if (isStationEditPopupOpen()) return;
  if (!canShowTransferSnapHint()) {
    hideTransferSnapHint();
    return;
  }

  hideRouteHoverPopup();
  hideStationBrowsePopup();

  if (snapNear && !deps.isOccupied(snapNear.feature)) {
    const snapId = snapNear.feature.properties?.snap_id || "";
    showTransferSnapHint(snapNear.feature.geometry.coordinates, snapId, point);
    return;
  }

  scheduleTransferSnapHintUpdate(lngLat, deps, point);
}
