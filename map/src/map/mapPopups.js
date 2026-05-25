/**
 * Central Mapbox popup manager.
 *
 * All map hover / hint popups must go through this module so mode rules stay in one place:
 *
 * | Popup              | Allowed modes                                      |
 * |--------------------|----------------------------------------------------|
 * | Route hover        | general, edit-route-select, merge, split-line      |
 * | Station browse     | general, edit-route-select, merge, split-line      |
 * | Transfer snap hint | edit-station (station submode, not while dragging)   |
 * | Station edit       | edit-station (explicit click)                      |
 *
 * edit-station never shows route hover popups (prevents covering transfer snap hints).
 */
import mapboxgl from "mapbox-gl";
import { t } from "../i18n/i18n.js";
import { resolveRouteDisplayNameFromProps } from "./defaultNames.js";
import { popupScreenPoint, resolvePopupPlacement } from "./popupPlacement.js";

const MAP_HOVER_POPUP_CLASS = "map-hover-popup";
const TRANSFER_SNAP_POPUP_CLASS = "transfer-snap-hint-popup";

const BROWSE_MODES = new Set(["general", "edit-route-select", "merge", "split-line"]);

/** @typedef {{ mode: string, editStationSubmode: string, draggingType: string | null }} MapPopupContext */

let getMapRef = () => null;
/** @type {() => MapPopupContext} */
let getContext = () => ({ mode: "general", editStationSubmode: "station", draggingType: null });

const popups = {
  route: null,
  station: null,
  transferSnap: null,
};

let lastTransferSnapHintId = "";
let transferSnapHoverRaf = null;
/** @type {import("mapbox-gl").LngLat | null} */
let pendingTransferSnapLngLat = null;

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
  if (ctx.mode !== "edit-station" || ctx.editStationSubmode === "move-label") return false;
  if (ctx.draggingType) return false;
  return true;
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
  if (popups.transferSnap) {
    popups.transferSnap.remove();
    popups.transferSnap = null;
  }
  lastTransferSnapHintId = "";
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

function ensureTransferSnapPopup() {
  if (popups.transferSnap) return popups.transferSnap;
  popups.transferSnap = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 14,
    anchor: "left",
    className: TRANSFER_SNAP_POPUP_CLASS,
  });
  return popups.transferSnap;
}

/**
 * @param {[number, number]} coordinates [lng, lat]
 * @param {string} snapId
 */
export function showTransferSnapHint(coordinates, snapId) {
  if (!canShowTransferSnapHint()) {
    hideTransferSnapHint();
    return;
  }
  const map = mapInstance();
  if (!map) return;

  if (snapId && snapId === lastTransferSnapHintId && popups.transferSnap?.isOpen()) return;
  lastTransferSnapHintId = snapId || "";

  hideRouteHoverPopup();

  ensureTransferSnapPopup()
    .setLngLat(coordinates)
    .setHTML(`<div class="transfer-snap-hint-popup__body">${t("popup.transferAdd")}</div>`)
    .addTo(map);
}

/**
 * @param {import("mapbox-gl").LngLat} lngLat
 * @param {{ findNearest: Function, isOccupied: Function, maxMeters: number }} deps
 */
export function scheduleTransferSnapHintUpdate(lngLat, deps) {
  if (!canShowTransferSnapHint()) {
    hideTransferSnapHint();
    return;
  }

  pendingTransferSnapLngLat = lngLat;
  if (transferSnapHoverRaf !== null) return;
  transferSnapHoverRaf = requestAnimationFrame(() => {
    transferSnapHoverRaf = null;
    if (!pendingTransferSnapLngLat) return;
    applyTransferSnapHintUpdate(pendingTransferSnapLngLat, deps);
  });
}

/**
 * @param {import("mapbox-gl").LngLat} lngLat
 * @param {{ findNearest: Function, isOccupied: Function, maxMeters: number }} deps
 */
export function applyTransferSnapHintUpdate(lngLat, deps) {
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
  showTransferSnapHint(found.feature.geometry.coordinates, snapId);
}

/**
 * @param {import("mapbox-gl").LngLat} lngLat
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

  popups.route = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    anchor: placement.anchor,
    offset: placement.offset,
    className: MAP_HOVER_POPUP_CLASS,
  });
  popups.route.setLngLat(lngLat).setHTML(html).addTo(map);
}

/**
 * @param {import("mapbox-gl").LngLat} lngLat
 * @param {string} bodyHtml inner HTML for `.map-hover-popup__body`
 * @param {{ x: number, y: number } | undefined} point
 * @param {number} estHeight
 */
export function showStationBrowsePopup(lngLat, bodyHtml, point, estHeight) {
  if (!canShowStationBrowsePopup()) return;

  const map = mapInstance();
  if (!map) return;

  hideTransferSnapHint();

  const placement = resolvePopupPlacement(map, popupScreenPoint(map, lngLat, point), { estHeight });
  if (popups.station) {
    popups.station.remove();
    popups.station = null;
  }

  popups.station = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    anchor: placement.anchor,
    offset: placement.offset,
    className: MAP_HOVER_POPUP_CLASS,
  });
  popups.station.setLngLat(lngLat).setHTML(bodyHtml).addTo(map);
}

/**
 * @param {import("mapbox-gl").LngLatLike} lngLat
 * @param {string} html
 */
export function openStationEditPopup(lngLat, html) {
  hideRouteHoverPopup();
  hideStationBrowsePopup();
  hideTransferSnapHint();

  if (popups.station) popups.station.remove();

  popups.station = new mapboxgl.Popup({ closeButton: true });
  popups.station.setLngLat(lngLat).setHTML(html).addTo(mapInstance());
}

export function closeStationEditPopup() {
  if (popups.station?.options?.closeButton) {
    popups.station.remove();
    popups.station = null;
  }
}

/** edit-station hover: only transfer snap hint, never route browse popup. */
export function refreshEditStationTransferHint(lngLat, deps, snapNear) {
  if (isStationEditPopupOpen()) return;
  if (!canShowTransferSnapHint()) {
    hideTransferSnapHint();
    return;
  }

  hideRouteHoverPopup();
  hideStationBrowsePopup();

  if (snapNear && !deps.isOccupied(snapNear.feature)) {
    const snapId = snapNear.feature.properties?.snap_id || "";
    showTransferSnapHint(snapNear.feature.geometry.coordinates, snapId);
    return;
  }

  scheduleTransferSnapHintUpdate(lngLat, deps);
}
