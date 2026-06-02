/**
 * Middle mouse button (wheel click) drag to pan — common on Windows CAD/GIS apps.
 *
 * @param {import("mapbox-gl").Map} map
 * @returns {() => void} cleanup
 */
export function configureMiddleButtonDragPan(map) {
  const canvas = map.getCanvas();
  let panning = false;
  let lastX = 0;
  let lastY = 0;
  let priorCursor = "";

  const stopPan = () => {
    if (!panning) return;
    panning = false;
    canvas.style.cursor = priorCursor;
  };

  const onMouseDown = (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    panning = true;
    priorCursor = canvas.style.cursor;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = "grabbing";
  };

  const onMouseMove = (e) => {
    if (!panning) return;
    e.preventDefault();
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dx !== 0 || dy !== 0) {
      map.panBy([-dx, -dy], { animate: false });
    }
  };

  const onMouseUp = (e) => {
    if (e.button !== 1) return;
    stopPan();
  };

  const onAuxClick = (e) => {
    if (e.button === 1) e.preventDefault();
  };

  canvas.addEventListener("mousedown", onMouseDown, { capture: true });
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("auxclick", onAuxClick);

  return () => {
    stopPan();
    canvas.removeEventListener("mousedown", onMouseDown, { capture: true });
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("auxclick", onAuxClick);
  };
}
