/** Image id for move-label mode: red rectangular frame around station names (via icon-text-fit). */
export const STATION_LABEL_FRAME_IMAGE_ID = "station-label-frame";

const FRAME_SIZE = 36;
const BORDER_PX = 4;

/**
 * Register a stretchable hollow rectangle border for use with `icon-text-fit` on symbol layers.
 * Must be called before adding the `stations-label-move-frame` layer.
 */
export function addStationLabelFrameImage(map) {
  if (!map || map.hasImage(STATION_LABEL_FRAME_IMAGE_ID)) return;

  const canvas = document.createElement("canvas");
  canvas.width = FRAME_SIZE;
  canvas.height = FRAME_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#e53935";
  const s = FRAME_SIZE;
  const b = BORDER_PX;
  ctx.fillRect(0, 0, s, b);
  ctx.fillRect(0, s - b, s, b);
  ctx.fillRect(0, b, b, s - 2 * b);
  ctx.fillRect(s - b, b, b, s - 2 * b);

  const imageData = ctx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE);
  map.addImage(STATION_LABEL_FRAME_IMAGE_ID, imageData, {
    pixelRatio: 2,
    content: [b, b, s - b, s - b],
    stretchX: [[b, s - b]],
    stretchY: [[b, s - b]],
  });
}
