/**
 * Spatial index helpers for transfer-snap pair generation.
 * Skips route pairs whose bounding boxes are too far apart.
 */
import * as turf from "@turf/turf";

const PAD_METERS = 12;

/** @param {object} feature */
function routeBBox(feature) {
  try {
    const bbox = turf.bbox(feature);
    const [minX, minY, maxX, maxY] = bbox;
    const padDeg = PAD_METERS / 111320;
    return [minX - padDeg, minY - padDeg, maxX + padDeg, maxY + padDeg];
  } catch {
    return null;
  }
}

function bboxOverlap(a, b) {
  if (!a || !b) return true;
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * @param {object[]} routes — LineString features
 * @returns {[number, number][]} index pairs [i, j] with i < j
 */
export function enumerateCandidateRoutePairs(routes) {
  const boxes = routes.map(routeBBox);
  /** @type {[number, number][]} */
  const pairs = [];
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      if (bboxOverlap(boxes[i], boxes[j])) pairs.push([i, j]);
    }
  }
  return pairs;
}
