import { getMap } from "../mapInstance.js";
import { Route } from "../routeModel.js";
import { subscribeGeometryRevisionBump } from "../../metro/geometryRevisionBoundary.js";
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

  map.on("mousedown", (e) => {
    if (!isPrimaryMouseButton(e)) return;
    M.pointer.isDown = true;
  });
  map.on("mouseup", (e) => {
    M.pointer.isDown = false;
    if (isDraftingHoverMode()) {
      requestAnimationFrame(() => {
        if (!M.dragging.type) setCursorForMode(e);
      });
    }
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

  subscribeGeometryRevisionBump(() => {
    if (M.mode === "edit-station") Route.scheduleRefreshTransferSnapSource();
  });
}
