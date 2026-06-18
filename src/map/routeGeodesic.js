/**
 * Geodesic helpers for route display geometry.
 * Densifies sparse user vertices so Mapbox Mercator segments approximate great-circle arcs.
 */

import * as turf from "@turf/turf";

/** Below this length, keep the segment as a single chord (matches display smoothing threshold). */
const MIN_SEGMENT_METERS = 20;

const MIN_GEODESIC_STEPS = 2;
const MAX_GEODESIC_STEPS = 512;

/** Target spacing between densified vertices along the geodesic (meters). */
const GEODESIC_STEP_METERS = 40000;

const EPS = 1e-10;

function geodesicStepsForSegment(lenM) {
  if (lenM < MIN_SEGMENT_METERS) return 0;
  return Math.min(
    MAX_GEODESIC_STEPS,
    Math.max(MIN_GEODESIC_STEPS, Math.ceil(lenM / GEODESIC_STEP_METERS)),
  );
}

function appendDedup(out, pt) {
  if (out.length === 0) {
    out.push([...pt]);
    return;
  }
  const q = out[out.length - 1];
  if (Math.abs(q[0] - pt[0]) < EPS && Math.abs(q[1] - pt[1]) < EPS) return;
  out.push([...pt]);
}

/**
 * Insert intermediate coordinates along each geodesic segment between user vertices.
 * @param {number[][]} coords Stored LineString coordinates
 * @returns {number[][]}
 */
export function geodesicDensifyLineCoords(coords) {
  if (!coords || coords.length <= 1) {
    return coords ? coords.map((c) => [...c]) : coords;
  }

  const out = [];
  appendDedup(out, coords[0]);

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const lenM = turf.distance(turf.point(a), turf.point(b), { units: "meters" });
    const steps = geodesicStepsForSegment(lenM);

    if (steps === 0) {
      appendDedup(out, b);
      continue;
    }

    const segment = turf.lineString([a, b]);
    for (let s = 1; s <= steps; s++) {
      const pt = turf.along(segment, (lenM * s) / steps, { units: "meters" });
      appendDedup(out, pt.geometry.coordinates);
    }
  }

  return out;
}
