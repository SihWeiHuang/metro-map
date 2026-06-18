import * as turf from "@turf/turf";
import { getMap } from "../mapInstance.js";
import {
  mapOff,
  mapOn,
  mapOnce,
  projectMapPoint,
  unprojectMapPoint,
} from "../../map-runtime/mapEngine.js";
import { applyStationLabelCollision, applyStationLabelDragPlacement } from "../stationLabelCollision.js";
import { nearestPointOnSmoothedRoute } from "../displayLineSmoothing.js";
import { Route } from "../routeModel.js";
import { findStationById, findSubrouteBySubrouteId, getEditingSessions } from "../../data/routeQueries.js";
import {
  clearLabelDragLimitCircle,
  createStationLabelDragPreviewUpdater,
  drawLabelDragLimitCircle,
  getDisplayedStationCenter,
  getStationLabelVisualCoord,
  setStationPreviewCoord,
} from "../stationPreview.js";
import {
  getEditStationSubmode,
  LABEL_DRAG_RADIUS_METERS,
  M,
  STATION_CIRCLE_LAYERS,
  STATION_DRAG_CLICK_THRESHOLD_PX,
} from "./state.js";
import {
  getRouteFeature,
  isPrimaryMouseButton,
  queryFeaturesAtPoint,
  queryTempEditLineAtPoint,
} from "./layers.js";
import { clearStationHoverHighlight, addNearbyTransferStationFromClick, popupStationForEditing, setCursorForMode } from "./hover.js";
import { setStationLabelMoveFrameVisibility } from "./mapUi.js";

let tempNodePreviewRaf = null;
let labelDragPreviewRaf = null;
/** @type {{ update: (coord: number[]) => void, coord: number[] } | null} */
let pendingLabelDragPreview = null;
let stationDragPreviewRaf = null;
/** @type {{ map: import('../../map-runtime/mapTypes.js').MapLike, sid: string, lngLat: [number, number] } | null} */
let pendingStationDragPreview = null;

export function cancelTempNodeDragListeners() {
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
}

export function onMapClickWhileEditing(e) {
  if (M.suppressNextEditMapClick) {
    M.suppressNextEditMapClick = false;
    return;
  }
  const map = getMap();
  if (!map) return;
  const sessions = getEditingSessions();
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
        best = { subrouteId: session.subrouteId, insertAtStart };
      }
    });
    if (!best) {
      Route.addTempNodeAt(coord, sessions[0].subrouteId);
      return;
    }
    if (best.insertAtStart) Route.addTempNodeAt(coord, best.subrouteId, 0);
    else Route.addTempNodeAt(coord, best.subrouteId);
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
    const topLayerId = hitFeatures[0].layer.id;
    switch (topLayerId) {
      case "stations-circle":
      case "transfer-stations-circle": {
        const stationCoord = hitFeatures[0].geometry.coordinates;
        if (isNearAnyEndpoint(stationCoord)) return;
        Route.queueStationFromExisting(stationCoord);
        return;
      }
      case "routes-line": {
        const routeProps = hitFeatures[0].properties || {};
        const clickedRoute = getRouteFeature(routeProps.subroute_id);
        const routeCoords = clickedRoute?.geometry?.coordinates;
        if (!routeCoords || routeCoords.length < 2) return;
        const snapped = nearestPointOnSmoothedRoute(routeCoords, [e.lngLat.lng, e.lngLat.lat]);
        if (snapped?.geometry?.coordinates) addNodeToNearestRouteEndpoint(snapped.geometry.coordinates);
        return;
      }
      default:
        break;
    }
  }
  addNodeToNearestRouteEndpoint([e.lngLat.lng, e.lngLat.lat]);
}

export function onDragMoveAddRoute(e) {
  if (M.dragging.type !== "temp-node") return;
  if (M.dragging.isClickCandidate) {
    const dist = Math.sqrt(
      Math.pow(e.point.x - M.dragging.downPoint.x, 2) + Math.pow(e.point.y - M.dragging.downPoint.y, 2),
    );
    if (dist > 5) M.dragging.isClickCandidate = false;
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

export function finishTempNodeDrag() {
  if (tempNodePreviewRaf !== null) {
    cancelAnimationFrame(tempNodePreviewRaf);
    tempNodePreviewRaf = null;
  }
  if (M.dragging.isClickCandidate) return;
  Route.refreshTempEditSources();
  Route.refreshSources();
}

function updateStationDragPreviewImmediate(map, sid, lngLat) {
  const st = findStationById(sid);
  const rid = st?.properties?.subroute_id;
  const route = rid ? findSubrouteBySubrouteId(rid) : null;
  if (route?.geometry?.type === "LineString" && route.geometry.coordinates?.length >= 2) {
    const snapped = nearestPointOnSmoothedRoute(route.geometry.coordinates, lngLat);
    setStationPreviewCoord(map, sid, snapped?.geometry?.coordinates || lngLat);
    return;
  }
  setStationPreviewCoord(map, sid, lngLat);
}

function flushStationDragPreview() {
  if (stationDragPreviewRaf !== null) {
    cancelAnimationFrame(stationDragPreviewRaf);
    stationDragPreviewRaf = null;
  }
  const pending = pendingStationDragPreview;
  pendingStationDragPreview = null;
  if (pending) updateStationDragPreviewImmediate(pending.map, pending.sid, pending.lngLat);
}

function updateStationDragPreview(map, sid, lngLat) {
  pendingStationDragPreview = { map, sid, lngLat };
  if (stationDragPreviewRaf !== null) return;
  stationDragPreviewRaf = requestAnimationFrame(() => {
    stationDragPreviewRaf = null;
    const pending = pendingStationDragPreview;
    pendingStationDragPreview = null;
    if (pending) updateStationDragPreviewImmediate(pending.map, pending.sid, pending.lngLat);
  });
}

function resolveStationDragLngLat(map, ev, grabOffsetPx) {
  if (!grabOffsetPx) return [ev.lngLat.lng, ev.lngLat.lat];
  const targetPx = { x: ev.point.x + grabOffsetPx.x, y: ev.point.y + grabOffsetPx.y };
  const ll = unprojectMapPoint(map, [targetPx.x, targetPx.y]);
  return [ll.lng, ll.lat];
}

function labelGrabOffsetPx(map, e, feature, stationCenter) {
  const centerPx = projectMapPoint(map, stationCenter);
  const offset = feature.properties?.label_offset_xy;
  const visualPx = Array.isArray(offset)
    ? { x: centerPx.x + offset[0] * 12, y: centerPx.y + offset[1] * 12 }
    : { x: e.point.x, y: e.point.y };
  return { x: visualPx.x - e.point.x, y: visualPx.y - e.point.y };
}

export function beginStationPositionDrag(e, opts = {}) {
  if (!isPrimaryMouseButton(e)) return;
  const feature = e.features?.[0];
  if (!feature?.properties?.station_id || feature.properties?.is_transfer_fixed) return;
  e.preventDefault();
  e.originalEvent?.stopPropagation?.();
  const sid = feature.properties.station_id;
  const st = findStationById(sid);
  if (!st) return;
  M.dragging.type = "station";
  M.dragging.stationId = sid;
  M.dragging.isClickCandidate = true;
  M.dragging.downPoint = e.point;
  const map = getMap();
  clearStationHoverHighlight();
  applyStationLabelDragPlacement(map);
  const dragCenter = getDisplayedStationCenter(map, sid, st.geometry.coordinates);
  const grabOffsetPx = opts.grabFromLabel ? labelGrabOffsetPx(map, e, feature, dragCenter) : null;
  const onDragStation = (ev) => {
    if (M.dragging.type !== "station" || M.dragging.stationId !== sid) return;
    if (M.dragging.isClickCandidate) {
      const dist = Math.sqrt(
        Math.pow(ev.point.x - M.dragging.downPoint.x, 2) + Math.pow(ev.point.y - M.dragging.downPoint.y, 2),
      );
      if (dist > STATION_DRAG_CLICK_THRESHOLD_PX) M.dragging.isClickCandidate = false;
    }
    if (!M.dragging.isClickCandidate) {
      updateStationDragPreview(map, sid, resolveStationDragLngLat(map, ev, grabOffsetPx));
    }
  };
  mapOn(map, "mousemove", onDragStation);
  mapOnce(map, "mouseup", (ev) => {
    mapOff(map, "mousemove", onDragStation);
    const wasClick = M.dragging.isClickCandidate;
    M.dragging.isClickCandidate = false;
    M.dragging.downPoint = null;
    if (wasClick) {
      flushStationDragPreview();
      M.dragging.type = null;
      M.dragging.stationId = null;
      if (getEditStationSubmode() === "crud" && M.hover.transferSnapId) {
        if (addNearbyTransferStationFromClick(ev.lngLat, st.properties?.subroute_id ?? "")) {
          setCursorForMode();
          return;
        }
      }
      M.suppressNextEditMapClick = true;
      popupStationForEditing(st);
      setCursorForMode();
      return;
    }
    flushStationDragPreview();
    updateStationDragPreview(map, sid, resolveStationDragLngLat(map, ev, grabOffsetPx));
    Route.moveStationAlongRoute(sid, getDisplayedStationCenter(map, sid, st.geometry.coordinates));
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
  return turf.destination(turf.point(dragCenter), LABEL_DRAG_RADIUS_METERS, bearing, { units: "meters" }).geometry
    .coordinates;
}

export function beginStationLabelOnlyDrag(e) {
  if (!isPrimaryMouseButton(e)) return;
  e.preventDefault();
  e.originalEvent?.stopPropagation?.();
  const feature = e.features?.[0];
  if (!feature?.properties?.station_id) return;
  const sid = feature.properties.station_id;
  const st = findStationById(sid);
  if (!st) return;
  const map = getMap();
  M.dragging.type = "station-label";
  M.dragging.stationId = sid;
  applyStationLabelDragPlacement(map);
  const dragCenter = getDisplayedStationCenter(map, sid, st.geometry.coordinates);
  drawLabelDragLimitCircle(map, dragCenter, LABEL_DRAG_RADIUS_METERS);
  setStationLabelMoveFrameVisibility(false);
  const updatePreview = createStationLabelDragPreviewUpdater(map, sid, dragCenter);
  const centerPx = projectMapPoint(map, dragCenter);
  const offset = feature.properties?.label_offset_xy;
  const visualPx = Array.isArray(offset)
    ? { x: centerPx.x + offset[0] * 12, y: centerPx.y + offset[1] * 12 }
    : { x: e.point.x, y: e.point.y };
  const grabOffsetPx = { x: visualPx.x - e.point.x, y: visualPx.y - e.point.y };
  let currentLabelCoord = getStationLabelVisualCoord(map, sid, dragCenter);
  const onDragLabel = (ev) => {
    if (M.dragging.type !== "station-label" || M.dragging.stationId !== sid) return;
    const targetPx = { x: ev.point.x + grabOffsetPx.x, y: ev.point.y + grabOffsetPx.y };
    const targetLngLat = unprojectMapPoint(map, [targetPx.x, targetPx.y]);
    currentLabelCoord = clampLabelCoordToDragRadius(dragCenter, [targetLngLat.lng, targetLngLat.lat]);
    scheduleLabelDragPreview(updatePreview, currentLabelCoord);
  };
  mapOn(map, "mousemove", onDragLabel);
  mapOnce(map, "mouseup", () => {
    mapOff(map, "mousemove", onDragLabel);
    flushLabelDragPreview();
    Route.setStationLabelPosition(sid, currentLabelCoord);
    clearLabelDragLimitCircle(map);
    if (getEditStationSubmode() === "move-label") {
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
