import { getMap } from "../mapInstance.js";

export function setStationLabelMoveFrameVisibility(visible) {
  const map = getMap();
  if (!map?.getLayer("stations-label-move-frame")) return;
  map.setLayoutProperty("stations-label-move-frame", "visibility", visible ? "visible" : "none");
}

export function setZoomInteractionsEnabled(enabled) {
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
