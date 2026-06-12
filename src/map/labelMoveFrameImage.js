import { addMapImage } from "../map-runtime/mapEngine.js";

/** Image id for move-label mode: L-shaped corner brackets around station names (via icon-text-fit). */
export const STATION_LABEL_FRAME_IMAGE_ID = "station-label-frame";

const FRAME_SIZE = 36;

/** 線條粗細（像素）。 */
const BORDER_PX = 4;

/** 每個角 L 型臂長（從角點往內延伸的長度）。 */
const ARM_LENGTH = 15;

/**
 * ★ 圓角程度（像素半徑）— 在這裡調整 L 轉角的圓滑程度。
 * 建議 2～4：輕微圓角；調大更圓；設為 0 則為直角。
 * 不可大於 ARM_LENGTH，否則 L 型臂會被圓角吃掉。
 */
const CORNER_RADIUS = 3;

/** 角標顏色。 */
const FRAME_COLOR = "#e53935";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {"tl" | "tr" | "br" | "bl"} corner
 * @param {number} size
 */
function drawCornerBracket(ctx, corner, size) {
  const h = BORDER_PX / 2;
  const r = CORNER_RADIUS;
  const arm = ARM_LENGTH;

  ctx.beginPath();
  switch (corner) {
    case "tl":
      ctx.moveTo(arm, h);
      ctx.lineTo(r + h, h);
      ctx.arcTo(h, h, h, r + h, r);
      ctx.lineTo(h, arm);
      break;
    case "tr":
      ctx.moveTo(size - arm, h);
      ctx.lineTo(size - r - h, h);
      ctx.arcTo(size - h, h, size - h, r + h, r);
      ctx.lineTo(size - h, arm);
      break;
    case "br":
      ctx.moveTo(size - arm, size - h);
      ctx.lineTo(size - r - h, size - h);
      ctx.arcTo(size - h, size - h, size - h, size - r - h, r);
      ctx.lineTo(size - h, size - arm);
      break;
    case "bl":
      ctx.moveTo(arm, size - h);
      ctx.lineTo(r + h, size - h);
      ctx.arcTo(h, size - h, h, size - r - h, r);
      ctx.lineTo(h, size - arm);
      break;
    default:
      break;
  }
  ctx.stroke();
}

/**
 * Register a stretchable four-corner L-bracket image for use with `icon-text-fit` on symbol layers.
 * Must be called before adding the `stations-label-move-frame` layer.
 */
/** @param {import('../map-runtime/mapTypes.js').MapLike} map */
export function addStationLabelFrameImage(map) {
  if (!map) return;

  const canvas = document.createElement("canvas");
  canvas.width = FRAME_SIZE;
  canvas.height = FRAME_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.strokeStyle = FRAME_COLOR;
  ctx.lineWidth = BORDER_PX;
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";

  const s = FRAME_SIZE;
  for (const corner of ["tl", "tr", "br", "bl"]) {
    drawCornerBracket(ctx, corner, s);
  }

  const imageData = ctx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE);
  addMapImage(map, STATION_LABEL_FRAME_IMAGE_ID, imageData, {
    pixelRatio: 2,
    content: [ARM_LENGTH, ARM_LENGTH, s - ARM_LENGTH, s - ARM_LENGTH],
    stretchX: [[ARM_LENGTH, s - ARM_LENGTH]],
    stretchY: [[ARM_LENGTH, s - ARM_LENGTH]],
  });
}
