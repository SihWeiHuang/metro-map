import { getMap } from "../mapInstance.js";
import { hasLayer, setMapLayoutProperty, setMapZoomInteractionsEnabled } from "../../map-runtime/mapEngine.js";

export function setStationLabelMoveFrameVisibility(visible) {
  const map = getMap();
  if (!map || !hasLayer(map, "stations-label-move-frame")) return;
  setMapLayoutProperty(map, "stations-label-move-frame", "visibility", visible ? "visible" : "none");
}

export function setZoomInteractionsEnabled(enabled) {
  const map = getMap();
  if (!map) return;
  setMapZoomInteractionsEnabled(map, enabled);
}
