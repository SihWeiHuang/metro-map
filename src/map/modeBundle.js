import mapboxgl from "mapbox-gl";
import * as turf from "@turf/turf";
import { getMap } from "./mapInstance.js";
import { nearestPointOnSmoothedRoute } from "./displayLineSmoothing.js";
import { clearRoutesLineHoverFilter, setStationHoverPairFilters } from "./mapHoverFilters.js";
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

let onModeChange = () => {};
let onEditStationSubmodeChange = () => {};
let onModeHintChange = () => {};

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
  popups: { route: null, station: null, transferSnapHint: null },
};

export const Modes = {};
const mergePick = [];
let lastTransferSnapHintId = "";
const LABEL_DRAG_RADIUS_METERS = 500;
let editStationSubmode = "station";
const STATION_PRIORITY_ENTER_PX = 8;
const STATION_PRIORITY_EXIT_PX = 14;
let stationPriorityLock = false;

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
    case "ungroup":
      return t("modeHint.ungroup");
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
    clearTransferSnapHintPopupOnly();
    Route.clearHover();
    if (map.getLayer("routes-line-hover")) {
      map.setFilter("routes-line-hover", ["==", ["get", "route_id"], ""]);
    }
    if (map.getLayer("stations-circle-hover")) {
      map.setFilter("stations-circle-hover", ["==", ["get", "station_id"], ""]);
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
    cursor = "crosshair";
    if (e) {
      const onNode = map.queryRenderedFeatures(e.point, { layers: ["temp-edit-nodes-layer"] });
      if (onNode.length) {
        cursor = "grab";
      } else {
        const onStation = map.queryRenderedFeatures(e.point, { layers: ["stations-circle"] });
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
      const onStation = map.queryRenderedFeatures(e.point, { layers: ["stations-circle"] });
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
  stationPriorityLock = false;
  Route.clearHover();
  const map = getMap();
  if (map && map.getLayer("stations-label-hover")) {
    map.setFilter("stations-label-hover", ["==", ["get", "station_id"], ""]);
  }

  if (M.popups.route) {
    M.popups.route.remove();
  }

  if (M.popups.station && !M.popups.station.options.closeButton) {
    M.popups.station.remove();
  }
}

function clearTransferSnapHintPopupOnly() {
  if (M.popups.transferSnapHint) {
    M.popups.transferSnapHint.remove();
    M.popups.transferSnapHint = null;
  }
  lastTransferSnapHintId = "";
}

function updateTransferSnapHoverFromLngLat(lngLat) {
  if (M.mode !== "edit-station" || editStationSubmode === "move-label") {
    clearTransferSnapHintPopupOnly();
    return;
  }
  if (M.dragging.type) {
    clearTransferSnapHintPopupOnly();
    return;
  }

  const found = findNearestTransferSnap(lngLat, TRANSFER_SNAP_HOVER_METERS);
  if (!found) {
    clearTransferSnapHintPopupOnly();
    return;
  }
  if (isTransferSnapOccupied(found.feature)) {
    clearTransferSnapHintPopupOnly();
    return;
  }

  const snapId = found.feature.properties?.snap_id || "";
  if (snapId === lastTransferSnapHintId && M.popups.transferSnapHint?.isOpen()) return;
  lastTransferSnapHintId = snapId;

  if (M.popups.route) {
    M.popups.route.remove();
    M.popups.route = null;
  }

  if (!M.popups.transferSnapHint) {
    M.popups.transferSnapHint = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      anchor: "left",
    });
  }
  M.popups.transferSnapHint
    .setLngLat(found.feature.geometry.coordinates)
    .setHTML(
      `<div style="font-size:12px;padding:4px 8px;background:#fffce7;border:1px solid #333;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.2);">${t(
        "popup.transferAdd"
      )}</div>`
    )
    .addTo(getMap());
}

function clearStationHoverOnly() {
  const map = getMap();
  M.hover.stationId = "";
  setStationHoverPairFilters(map, "");
}

function clearRouteHoverOnly() {
  const map = getMap();
  M.hover.routeId = "";
  if (map?.getLayer("routes-line-hover")) {
    map.setFilter("routes-line-hover", ["==", ["get", "route_id"], ""]);
  }
  if (M.popups.route) {
    M.popups.route.remove();
    M.popups.route = null;
  }
}

function hasStationNearPointer(map, point, radiusPx) {
  const bbox = [
    [point.x - radiusPx, point.y - radiusPx],
    [point.x + radiusPx, point.y + radiusPx],
  ];
  const onStation = map.queryRenderedFeatures(bbox, { layers: ["stations-circle", "stations-label"] });
  return onStation.length > 0;
}

export function popupRoute(lngLat, routeId) {
  const currentRoute = store.routesFC.features.find((x) => x.properties.route_id === routeId);
  if (!currentRoute) return;

  const groupId = currentRoute.properties.group_id;
  const routesInGroup = store.routesFC.features.filter((f) => f.properties.group_id === groupId);
  const routeIdsInGroup = routesInGroup.map((f) => f.properties.route_id);
  const stationCount = store.stationsFC.features.filter((s) => {
    const directHit = routeIdsInGroup.includes(s.properties.route_id);
    if (directHit) return true;
    const transferRoutes = s.properties?.transfer_routes || [];
    return transferRoutes.some((rid) => routeIdsInGroup.includes(rid));
  }).length;
  const groupDisplayName = routesInGroup[0]?.properties?.name || t("routeList.groupFallback", { id: groupId });
  if (M.popups.route) {
    M.popups.route.remove();
  }
  M.popups.route = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
  M.popups.route
    .setLngLat(lngLat)
    .setHTML(
      `<div>
        <b>${groupDisplayName}</b><br>
        ${t("popup.routeTotalStations", { n: stationCount })}
      </div>`
    )
    .addTo(getMap());
}

export function popupStation(lngLat, st) {
  const p = st.properties;
  const hoveredCoords = st.geometry.coordinates;

  const coincidentStations = store.stationsFC.features.filter((feature) => {
    const distance = turf.distance(feature.geometry.coordinates, hoveredCoords, { units: "meters" });
    return distance < 1;
  });

  const groups = new Map();
  coincidentStations.forEach((station) => {
    const parentRoute = store.routesFC.features.find((f) => f.properties.route_id === station.properties.route_id);
    if (parentRoute) {
      const groupId = parentRoute.properties.group_id;
      if (!groups.has(groupId)) {
        const firstRouteInGroup = store.routesFC.features.find((f) => f.properties.group_id === groupId);
        const groupDisplayName = firstRouteInGroup?.properties?.name || t("routeList.groupFallback", { id: groupId });
        groups.set(groupId, groupDisplayName);
      }
    }
  });

  const stationNameHTML = `<b>${p.name || p.station_id}</b>`;
  let groupInfoHTML = "";
  const groupNames = Array.from(groups.values());

  if (groupNames.length > 1) {
    groupInfoHTML =
      `<hr style="margin:2px 0;">${t("popup.routesPassingHeader")}<ul style="margin:0; padding-left:20px;">` +
      groupNames.map((name) => `<li>${name}</li>`).join("") +
      "</ul>";
  } else if (groupNames.length === 1) {
    groupInfoHTML = `<br>${groupNames[0]}`;
  }

  if (M.popups.station) {
    M.popups.station.remove();
  }
  M.popups.station = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

  M.popups.station.setLngLat(lngLat).setHTML(`<div>${stationNameHTML}${groupInfoHTML}</div>`).addTo(getMap());
}

export function popupStationForEditing(station) {
  const p = station.properties;
  const currentName = p.name || p.station_id;

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
  if (M.popups.station) {
    M.popups.station.remove();
  }

  M.popups.station = new mapboxgl.Popup({ closeButton: true });
  M.popups.station.setLngLat(station.geometry.coordinates).setHTML(html).addTo(getMap());

  setTimeout(() => {
    const input = document.getElementById("station-name-input");
    input?.focus();

    document.getElementById("save-station-btn")?.addEventListener("click", () => {
      Route.setStationName(p.station_id, input.value);
      M.popups.station.remove();
    });

    document.getElementById("delete-station-btn")?.addEventListener("click", () => {
      if (confirm(t("popup.confirmDeleteStation", { name: currentName }))) {
        Route.removeStation(p.station_id);
        M.popups.station.remove();
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
  clearTransferSnapHintPopupOnly();
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

export function startUngroupRoute() {
  setMode("ungroup");
}

export function finishEditing() {
  if (M.mode === "edit-station") {
    const saveBtn = document.getElementById("save-station-btn");
    if (saveBtn) {
      saveBtn.click();
    }
    setMode("general");
  } else {
    const ok = Route.endTempEditingAndCommit();
    if (ok) {
      setMode("general");
    }
  }
}

export function cancelMerge() {
  setMode("general");
}

function onMapClickWhileEditing(e) {
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
    layers: ["temp-edit-nodes-layer", "temp-edit-line-layer", "stations-circle", "routes-line"],
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
      case "stations-circle": {
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
    Route.moveTempNode(M.dragging.idx, [e.lngLat.lng, e.lngLat.lat], M.dragging.routeId);
  }
}

Modes.general = {
  name: "general",
  onEnter() {},
  onLeave() {},
  onMapMove() {},

  onRouteMove(e) {
    const rid = e.features[0].properties.route_id;
    if (M.hover.routeId === rid) return;
    M.hover.routeId = rid;
    Route.highlightRoute(rid);
    popupRoute(e.lngLat, rid);
  },

  onStationMove(e) {
    if (M.pointer.isDown) return;
    const st = e.features[0];
    const sid = st.properties.station_id;
    const map = getMap();
    if (M.hover.stationId === sid) return;
    M.hover.stationId = sid;

    setStationHoverPairFilters(map, sid);

    popupStation(e.lngLat, st);
  },
};

Modes["add-route"] = {
  name: "add-route",
  onEnter() {
    Route.startNewTempRoute();
    clearStationHoverOnly();
  },
  onLeave() {},

  onMapMove(e) {
    setCursorForMode(e);
  },

  onMapClick(e) {
    clearStationHoverOnly();
    const map = getMap();
    const hitFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["temp-edit-nodes-layer", "temp-edit-line-layer", "stations-circle", "routes-line"],
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
      M.dragging.type = null;
      M.dragging.isClickCandidate = false;
      M.dragging.downPoint = null;
      setCursorForMode();
    });
  },

  onStationMove(e) {
    if (M.pointer.isDown) return;
    const st = e.features[0];
    const sid = st.properties.station_id;
    const map = getMap();

    if (M.hover.stationId === sid) return;
    M.hover.stationId = sid;

    clearRoutesLineHoverFilter(map);
    setStationHoverPairFilters(map, sid);
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

  onMapMove(e) {
    setCursorForMode(e);
  },

  onRouteMove(e) {
    const rid = e.features[0].properties.route_id;
    Route.highlightRoute(rid);
    popupRoute(e.lngLat, rid);
  },

  onRouteDown(e) {
    const props = e.features[0].properties;
    const groupId = props.group_id;
    popupRoute(e.lngLat, props.route_id);
    if (!groupId) return;

    Route.clearHover();
    Route.startEditGroup(groupId);
    const map = getMap();
    map.once("mouseup", () => setMode("edit-route-active"));
  },
};

Modes["edit-route-active"] = {
  name: "edit-route-active",
  onEnter() {},
  onLeave() {},
  onMapMove: Modes["add-route"].onMapMove,
  onMapClick: onMapClickWhileEditing,
  onTempLineClick: Modes["add-route"].onTempLineClick,
  onTempNodeClick: Modes["add-route"].onTempNodeClick,
  onTempNodeDown: Modes["add-route"].onTempNodeDown,
  onGlobalUp: Modes["add-route"].onGlobalUp,
  onStationMove: Modes["add-route"].onStationMove,
  onRouteClick: Modes["add-route"].onRouteClick,
};

Modes["edit-station"] = {
  name: "edit-station",
  onEnter() {
    onEditStationSubmodeChange(editStationSubmode);
    applyEditStationSubmode();
    clearStationHoverOnly();
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
    setCursorForMode(e);
    updateTransferSnapHoverFromLngLat(e.lngLat);
  },

  onMapClick(e) {
    const map = getMap();
    const hitFeatures = map.queryRenderedFeatures(e.point, {
      layers: ["stations-circle", "stations-label", "transfer-snaps-layer", "routes-line"],
    });

    if (hitFeatures.length) {
      const topFeature = hitFeatures[0];
      const topLayerId = topFeature.layer.id;
      const properties = topFeature.properties;

      switch (topLayerId) {
        case "stations-circle":
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
    clearStationHoverOnly();

    const onDragStation = (ev) => {
      if (M.dragging.type !== "station") return;
      const st = store.stationsFC.features.find((x) => x.properties.station_id === sid);
      const rid = st?.properties?.route_id;
      const route = rid ? store.routesFC.features.find((x) => x.properties?.route_id === rid) : null;
      if (route?.geometry?.type === "LineString" && route.geometry.coordinates?.length >= 2) {
        const snapped = nearestPointOnSmoothedRoute(route.geometry.coordinates, [ev.lngLat.lng, ev.lngLat.lat]);
        setStationPreviewCoord(map, sid, snapped?.geometry?.coordinates || [ev.lngLat.lng, ev.lngLat.lat]);
        return;
      }
      setStationPreviewCoord(map, sid, [ev.lngLat.lng, ev.lngLat.lat]);
    };

    if (map.getLayer("stations-label")) {
      map.setLayoutProperty("stations-label", "text-allow-overlap", true);
      map.setLayoutProperty("stations-label", "text-ignore-placement", true);
    }
    map.on("mousemove", onDragStation);

    map.once("mouseup", () => {
      map.off("mousemove", onDragStation);
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

  onRouteMove(e) {
    if (editStationSubmode === "move-label") return;
    if (M.popups.station && M.popups.station.isOpen() && M.popups.station.options.closeButton) {
      return;
    }

    if (M.dragging.type) return;
    const rid = e.features[0].properties.route_id;
    Route.highlightRoute(rid);
    const snapNear = findNearestTransferSnap(e.lngLat, TRANSFER_SNAP_HOVER_METERS);
    if (snapNear && !isTransferSnapOccupied(snapNear.feature)) {
      return;
    }
    popupRoute(e.lngLat, rid);
  },

  onStationMove(e) {
    if (M.pointer.isDown) return;
    if (M.popups.station && M.popups.station.isOpen() && M.popups.station.options.closeButton) {
      return;
    }
    if (M.dragging.type === "station" || M.dragging.type === "station-label") return;

    const st = e.features[0];
    const sid = st.properties.station_id;
    const map = getMap();
    if (M.hover.stationId === sid) return;
    M.hover.stationId = sid;
    setStationHoverPairFilters(map, sid);
    if (editStationSubmode !== "move-label") {
      popupStation(e.lngLat, st);
    }
  },
};

function getRouteFeature(route_id) {
  const f = store.routesFC.features.find((x) => x.properties.route_id === route_id);
  return f ? { type: "Feature", geometry: f.geometry, properties: f.properties } : null;
}

Modes.merge = {
  name: "merge",
  onEnter() {
    mergePick.length = 0;
    emitModeHint();
  },
  onLeave() {
    mergePick.length = 0;
    emitModeHint();
  },

  onRouteMove(e) {
    const rid = e.features[0].properties.route_id;
    Route.highlightRoute(rid);
  },

  onRouteClick(e) {
    const rid = e.features[0].properties.route_id;
    if (!mergePick.includes(rid)) mergePick.push(rid);
    Route.highlightRoute(rid);
    emitModeHint();
    if (mergePick.length === 2) {
      const res = Route.mergeRoutes(mergePick[0], mergePick[1]);
      if (!res.ok) alert(res.msg);
      setMode("general");
    }
  },
};

Modes.ungroup = {
  name: "ungroup",
  onEnter() {},
  onLeave() {},

  onRouteMove(e) {
    const rid = e.features[0].properties.route_id;
    Route.highlightRoute(rid);
    popupRoute(e.lngLat, rid);
  },

  onRouteClick(e) {
    const rid = e.features[0].properties.route_id;
    const res = Route.ungroupRoute(rid);
    if (!res.ok) alert(res.msg);
    setMode("general");
  },
};

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
  });
  map.on("mousemove", "routes-line", (e) => {
    // Station hover wins over route hover with hysteresis to prevent boundary flicker.
    if (hasStationNearPointer(map, e.point, STATION_PRIORITY_ENTER_PX)) {
      stationPriorityLock = true;
      clearRouteHoverOnly();
      return;
    }
    if (stationPriorityLock) {
      if (hasStationNearPointer(map, e.point, STATION_PRIORITY_EXIT_PX)) {
        clearRouteHoverOnly();
        return;
      }
      stationPriorityLock = false;
    }
    cur()?.onRouteMove?.(e);
  });
  map.on("mousemove", "stations-circle", (e) => cur()?.onStationMove?.(e));
  map.on("mousemove", "stations-label", (e) => cur()?.onStationMove?.(e));
  map.on("mouseleave", "routes-line", () => clearHoverAndPopups());
  map.on("mouseleave", "stations-circle", () => clearHoverAndPopups());
  map.on("mouseleave", "stations-label", () => clearHoverAndPopups());

  map.on("click", (e) => cur()?.onMapClick?.(e));
  map.on("click", "routes-line", (e) => cur()?.onRouteClick?.(e));
  map.on("click", "stations-circle", (e) => cur()?.onStationClick?.(e));
  map.on("click", "stations-label", (e) => cur()?.onStationClick?.(e));
  map.on("click", "temp-edit-line-layer", (e) => cur()?.onTempLineClick?.(e));

  map.on("mousedown", "routes-line", (e) => cur()?.onRouteDown?.(e));
  map.on("mousedown", "temp-edit-nodes-layer", (e) => cur()?.onTempNodeDown?.(e));
  map.on("mousedown", "stations-circle", (e) => cur()?.onStationDown?.(e));
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
