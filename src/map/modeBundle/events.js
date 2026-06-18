import { getMap } from "../mapInstance.js";
import { Route } from "../routeModel.js";
import { subscribeGeometryRevisionBump } from "../../metro/geometryRevisionBoundary.js";
import { mapOn } from "../../map-runtime/mapEngine.js";
import { cur, M, TEMP_EDIT_LINE_HIT_LAYER } from "./state.js";
import { isPrimaryMouseButton } from "./layers.js";
import {
  clearHoverAndPopups,
  isDraftingHoverMode,
  setCursorForMode,
  shouldSkipPointerHoverWork,
  updateHoverFromPointer,
} from "./hover.js";
import { updateTransferSnapVisibility } from "./control.js";

let pointerMoveRaf = null;
let pendingPointerMoveEvent = null;

function flushPointerMoveHandlers() {
  pointerMoveRaf = null;
  const e = pendingPointerMoveEvent;
  pendingPointerMoveEvent = null;
  if (!e) return;
  setCursorForMode(e);
  if (isDraftingHoverMode() && shouldSkipPointerHoverWork()) return;
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

  mapOn(map, "mousedown", (e) => {
    if (!isPrimaryMouseButton(e)) return;
    M.pointer.isDown = true;
  });
  mapOn(map, "mouseup", (e) => {
    M.pointer.isDown = false;
    if (isDraftingHoverMode()) {
      requestAnimationFrame(() => {
        if (!M.dragging.type) setCursorForMode(e);
      });
    }
  });

  mapOn(map, "mousemove", (e) => {
    cur()?.onMapMove?.(e);
    schedulePointerMoveHandlers(e);
  });
  mapOn(map, "mouseleave", () => clearHoverAndPopups());

  mapOn(map, "click", (e) => cur()?.onMapClick?.(e));
  mapOn(map, "click", (e) => cur()?.onRouteClick?.(e), "routes-line");
  mapOn(map, "click", (e) => cur()?.onTransferSnapClick?.(e), "transfer-snaps-layer");
  mapOn(map, "click", (e) => cur()?.onStationClick?.(e), "stations-circle");
  mapOn(map, "click", (e) => cur()?.onStationClick?.(e), "transfer-stations-circle");
  mapOn(map, "click", (e) => cur()?.onStationClick?.(e), "stations-label");
  mapOn(map, "click", (e) => cur()?.onStationClick?.(e), "stations-label-hover");
  mapOn(map, "click", (e) => cur()?.onTempLineClick?.(e), "temp-edit-line-layer");
  mapOn(map, "click", (e) => cur()?.onTempLineClick?.(e), TEMP_EDIT_LINE_HIT_LAYER);

  mapOn(map, "mousedown", (e) => cur()?.onRouteDown?.(e), "routes-line");
  mapOn(map, "mousedown", (e) => cur()?.onTempNodeDown?.(e), "temp-edit-nodes-layer");
  mapOn(map, "mousedown", (e) => cur()?.onStationDown?.(e), "stations-circle");
  mapOn(map, "mousedown", (e) => cur()?.onStationDown?.(e), "transfer-stations-circle");
  mapOn(map, "mousedown", (e) => cur()?.onStationLabelDown?.(e), "stations-label");
  mapOn(map, "mousedown", (e) => cur()?.onStationLabelDown?.(e), "stations-label-hover");
  updateTransferSnapVisibility();

  subscribeGeometryRevisionBump(() => {
    if (M.mode === "edit-station") {
      Route.scheduleRefreshTransferSnapSource();
      Route.scheduleRefreshAbsorbZonesSource();
    }
  });
}
