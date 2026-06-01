/** Wheel delta → zoom change (tuned for mouse wheel; trackpad uses same scale). */
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

/**
 * Replace Mapbox default scroll zoom so wheel direction matches common map UX:
 * scroll up (wheel away from you) = zoom in, scroll down = zoom out.
 * Mapbox's built-in handler feels reversed on many Windows mice.
 *
 * Preserves map.scrollZoom.enable/disable/isEnabled for edit-mode toggles.
 *
 * @param {import("mapbox-gl").Map} map
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

    const canvas = map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const around = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);

    map.easeTo({
      zoom: map.getZoom() - delta * WHEEL_ZOOM_SENSITIVITY,
      around,
      duration: 0,
      essential: true,
    });
  };

  const container = map.getCanvasContainer();
  container.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    container.removeEventListener("wheel", onWheel);
  };
}
