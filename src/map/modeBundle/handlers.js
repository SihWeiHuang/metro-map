import * as turf from "@turf/turf";
import { getMap } from "../mapInstance.js";
import {
  mapOff,
  mapOn,
  mapOnce,
  queryRenderedFeatures,
  setMapCanvasCursor,
} from "../../map-runtime/mapEngine.js";
import { applyStationLabelCollision } from "../stationLabelCollision.js";
import { nearestPointOnSmoothedRoute } from "../displayLineSmoothing.js";
import { Route } from "../routeModel.js";
import { isTransferSnapOccupied } from "../routeTransferSnap.js";
import { getPrimaryEditingSession } from "../../data/routeQueries.js";
import { clearLabelDragLimitCircle } from "../stationPreview.js";
import {
  DEFAULT_EDIT_STATION_SUBMODE,
  getEditStationSubmode,
  M,
  Modes,
  STATION_CIRCLE_LAYERS,
} from "./state.js";
import {
  getRouteFeature,
  isPrimaryMouseButton,
  queryFeaturesAtPoint,
  queryTempEditLineAtPoint,
  subrouteIdFromStationEvent,
} from "./layers.js";
import { closeStationEditPopup } from "../mapPopups.js";
import {
  addNearbyTransferStationFromClick,
  popupRoute,
  popupStationForEditing,
  resetStationEditPopupState,
  resolveTransferSnapCandidateFromMapClick,
  setCursorForMode,
  stationEditClickLayers,
  stationFeatureFromMapClick,
  suppressUiAfterTransferAdd,
} from "./hover.js";
import {
  beginStationLabelOnlyDrag,
  beginStationPositionDrag,
  finishTempNodeDrag,
  onDragMoveAddRoute,
  onMapClickWhileEditing,
} from "./drag.js";
import {
  applyEditStationSubmode,
  emitModeHint,
  pickRouteForMerge,
  pickSubRouteForSplitLine,
  setEditStationSubmodeInternal,
  setMode,
  setStationLabelMoveFrameVisibility,
  setZoomInteractionsEnabled,
} from "./control.js";
import { setEditStationSubmodeState } from "../../metro/mapInteractionBoundary.js";
import { resetMergePickSubrouteIds } from "../../metro/mapInteractionBoundary.js";

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
          const routeProps = hitFeatures[0].properties || {};
          const clickedRoute = getRouteFeature(routeProps.subroute_id);
          const routeCoords = clickedRoute?.geometry?.coordinates;
          if (!routeCoords || routeCoords.length < 2) break;
          const snapped = nearestPointOnSmoothedRoute(routeCoords, [e.lngLat.lng, e.lngLat.lat]);
          if (!snapped?.geometry?.coordinates) break;
          const session = getPrimaryEditingSession();
          const nodes = session.nodes;
          if (nodes.length > 0) {
            const distToStart = turf.distance(turf.point(snapped.geometry.coordinates), turf.point(nodes[0]));
            const distToEnd = turf.distance(
              turf.point(snapped.geometry.coordinates),
              turf.point(nodes[nodes.length - 1]),
            );
            if (distToStart < distToEnd) Route.addTempNodeAt(snapped.geometry.coordinates, session.subrouteId, 0);
            else Route.addTempNodeAt(snapped.geometry.coordinates, session.subrouteId);
          } else {
            Route.addTempNodeAt(snapped.geometry.coordinates, session.subrouteId);
          }
          break;
        }
      }
    } else {
      const session = getPrimaryEditingSession();
      const nodes = session.nodes;
      const clickCoord = [e.lngLat.lng, e.lngLat.lat];
      if (nodes.length > 0) {
        const distToStart = turf.distance(turf.point(clickCoord), turf.point(nodes[0]));
        const distToEnd = turf.distance(turf.point(clickCoord), turf.point(nodes[nodes.length - 1]));
        if (distToStart < distToEnd) Route.addTempNodeAt(clickCoord, session.subrouteId, 0);
        else Route.addTempNodeAt(clickCoord, session.subrouteId);
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
    const map = getMap();
    setMapCanvasCursor(map, "grabbing");
    mapOn(map, "mousemove", onDragMoveAddRoute);
    mapOnce(map, "mouseup", () => {
      mapOff(map, "mousemove", onDragMoveAddRoute);
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
    mapOnce(getMap(), "mouseup", () => setMode("edit-route-active"));
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
    Route.scheduleRefreshTransferSnapSource();
    Route.scheduleRefreshAbsorbZonesSource();
    setEditStationSubmodeState(getEditStationSubmode());
    applyEditStationSubmode();
    if (getEditStationSubmode() === "crud") {
      Route.ensureTransferSnapSourceReady();
      Route.ensureAbsorbZonesSourceReady();
    }
    Route.clearHover();
  },
  onLeave() {
    Route.cancelScheduledTransferSnapRefresh();
    Route.cancelScheduledAbsorbZonesRefresh();
    closeStationEditPopup();
    resetStationEditPopupState();
    const map = getMap();
    if (map) {
      clearLabelDragLimitCircle(map);
      setStationLabelMoveFrameVisibility(false);
      applyStationLabelCollision(map);
    }
    setZoomInteractionsEnabled(true);
    setEditStationSubmodeInternal(DEFAULT_EDIT_STATION_SUBMODE);
  },
  onTransferSnapClick(e) {
    if (getEditStationSubmode() !== "crud") return;
    e.preventDefault();
    const feature = e.features?.[0];
    if (!feature || feature.layer?.id !== "transfer-snaps-layer") return;
    if (isTransferSnapOccupied(feature)) return;
    const properties = feature.properties;
    const ridA = properties.subroute_id_a;
    const ridB = properties.subroute_id_b;
    if (ridA && ridB) {
      Route.addTransferStationAt(feature.geometry.coordinates, ridA, ridB);
      suppressUiAfterTransferAdd();
    }
  },
  onMapClick(e) {
    const map = getMap();
    const clickLayers = stationEditClickLayers();
    if (!clickLayers.length) return;
    const hitFeatures = queryRenderedFeatures(map, e.point, { layers: clickLayers });
    if (!hitFeatures.length) return;
    const topFeature = hitFeatures[0];
    const topLayerId = topFeature.layer.id;
    const properties = topFeature.properties;

    if (getEditStationSubmode() === "crud") {
      const candidate = resolveTransferSnapCandidateFromMapClick(map, e.point, e.lngLat, topLayerId);
      if (candidate?.ridA && candidate?.ridB) {
        Route.addTransferStationAt(candidate.center, candidate.ridA, candidate.ridB);
        suppressUiAfterTransferAdd();
        return;
      }
    }

    if (M.suppressNextEditMapClick) {
      M.suppressNextEditMapClick = false;
      return;
    }
    if (topLayerId === "transfer-snaps-layer") return;
    if (getEditStationSubmode() === "crud") {
      const stationForEdit = stationFeatureFromMapClick(hitFeatures);
      if (stationForEdit) {
        popupStationForEditing(stationForEdit);
        return;
      }
    }
    if (topLayerId === "routes-line" && getEditStationSubmode() === "crud") {
      if (
        !addNearbyTransferStationFromClick(e.lngLat, properties.subroute_id)
      ) {
        const routeFeature = getRouteFeature(properties.subroute_id);
        if (!routeFeature?.geometry?.coordinates || routeFeature.geometry.coordinates.length < 2) return;
        const snapped = nearestPointOnSmoothedRoute(routeFeature.geometry.coordinates, [e.lngLat.lng, e.lngLat.lat]);
        if (!snapped?.geometry?.coordinates) return;
        const routeColor = routeFeature.properties.color ?? null;
        Route.addStationAt(properties.subroute_id, snapped.geometry.coordinates, null, routeColor);
        Route.highlightRoute(properties.subroute_id);
      }
    }
  },
  onStationDown(e) {
    if (getEditStationSubmode() !== "crud") return;
    if (M.hover.transferSnapId) return;
    beginStationPositionDrag(e);
  },
  onStationLabelDown(e) {
    if (getEditStationSubmode() === "move-label") beginStationLabelOnlyDrag(e);
    else if (getEditStationSubmode() === "crud" && !M.hover.transferSnapId) {
      beginStationPositionDrag(e, { grabFromLabel: true });
    }
  },
};

Modes.merge = {
  name: "merge",
  onEnter() {
    resetMergePickSubrouteIds();
    emitModeHint();
  },
  onLeave() {
    resetMergePickSubrouteIds();
    emitModeHint();
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
