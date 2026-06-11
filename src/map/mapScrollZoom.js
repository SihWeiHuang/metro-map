/** Wheel delta → zoom change (tuned for mouse wheel; trackpad uses same scale). */
import {
  easeToMapCamera,
  getMapCanvas,
  getMapCanvasContainer,
  getMapZoom,
  unprojectMapPoint,
} from "../map-runtime/mapEngine.js";

const WHEEL_ZOOM_SENSITIVITY = 0.0015;

/**
 * Replace Mapbox default scroll zoom so wheel direction matches common map UX:
 * scroll up (wheel away from you) = zoom in, scroll down = zoom out.
 *
 * Preserves map.scrollZoom.enable/disable/isEnabled for edit-mode toggles.
 *
 * @param {import("../map-runtime/mapTypes.js").MapLike} map
 * @returns {() => void} cleanup
 */
export function configureScrollZoom(map) {
  map.scrollZoom.disable();

  let enabled = true;
  map.scrollZoom.enable = () => {
    enabled = true;
  };
  map.scrollZoom.disable = () => {
    enabled = false;
  };
  map.scrollZoom.isEnabled = () => enabled;

  const onWheel = (e) => {
    if (!enabled) return;

    e.preventDefault();

    let delta = e.deltaY;
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 40;
    else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= 800;
    if (delta === 0) return;

    const canvas = getMapCanvas(map);
    const rect = canvas.getBoundingClientRect();
    const around = unprojectMapPoint(map, [e.clientX - rect.left, e.clientY - rect.top]);

    easeToMapCamera(map, {
      zoom: getMapZoom(map) - delta * WHEEL_ZOOM_SENSITIVITY,
      around,
      duration: 0,
      essential: true,
    });
  };

  const container = getMapCanvasContainer(map);
  container.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    container.removeEventListener("wheel", onWheel);
  };
}
