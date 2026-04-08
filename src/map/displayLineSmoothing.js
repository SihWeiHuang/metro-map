/**
 * Display-only smoothing: curve through the same vertices (stored polyline unchanged).
 * - Short edges (meters): linear interpolation to avoid Catmull–Rom bulge when nodes are close.
 * - Longer edges: centripetal Catmull–Rom (α=0.5) for more stable curves on uneven spacing / tight bends.
 */

import * as turf from "@turf/turf";

/** Below this chord length (meters), draw the segment as a straight line on screen. */
const SHORT_SEGMENT_METERS = 20;

/** Base samples per long segment; scales slightly with length. */
const MIN_STEPS = 10;
const MAX_STEPS = 22;
const STEPS_PER_100M = 6;

const EPS = 1e-10;

function distM(a, b) {
  return turf.distance(turf.point(a), turf.point(b), { units: "meters" });
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
 * Centripetal Catmull–Rom on one segment from p1→p2 with neighbors p0,p3.
 * t ∈ [0, 1] maps along the spline from p1 to p2.
 * After Yuksel et al. / common StackOverflow formulation (recursive lerp on knot times).
 */
function centripetalCatmullRomSegment(p0, p1, p2, p3, t, alpha) {
  function chordLen(p, q) {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    return Math.pow(dx * dx + dy * dy, alpha * 0.5);
  }

  const t0 = 0;
  const dt01 = chordLen(p0, p1);
  const dt12 = chordLen(p1, p2);
  const dt23 = chordLen(p2, p3);
  const t1 = t0 + dt01;
  const t2 = t1 + dt12;
  const t3 = t2 + dt23;

  if (t2 - t1 < EPS) {
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  }

  const T = t1 + t * (t2 - t1);

  const lerp2 = (a, b, u0, u1, u) => {
    const d = u1 - u0;
    if (d < EPS) return [...a];
    const w = (u - u0) / d;
    return [a[0] + w * (b[0] - a[0]), a[1] + w * (b[1] - a[1])];
  };

  const A1 = lerp2(p0, p1, t0, t1, T);
  const A2 = lerp2(p1, p2, t1, t2, T);
  const A3 = lerp2(p2, p3, t2, t3, T);

  const B1 = lerp2(A1, A2, t0, t2, T);
  const B2 = lerp2(A2, A3, t1, t3, T);

  return lerp2(B1, B2, t1, t2, T);
}

function stepsForSegmentMeters(lenM) {
  return Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.round(MIN_STEPS + (lenM / 100) * STEPS_PER_100M)));
}

export function smoothLineStringForDisplay(coords) {
  if (!coords || coords.length <= 1) return coords ? coords.map((c) => [...c]) : coords;
  if (coords.length === 2) {
    return coords.map((c) => [...c]);
  }

  const n = coords.length;
  const out = [];

  for (let i = 0; i < n - 1; i++) {
    const p0 = i === 0 ? coords[0] : coords[i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = i + 2 < n ? coords[i + 2] : coords[n - 1];

    const lenM = distM(p1, p2);

    if (lenM < SHORT_SEGMENT_METERS) {
      appendDedup(out, p1);
      appendDedup(out, p2);
      continue;
    }

    const steps = stepsForSegmentMeters(lenM);
    for (let s = 0; s <= steps; s++) {
      if (i > 0 && s === 0) continue;
      const u = s / steps;
      const pt = centripetalCatmullRomSegment(p0, p1, p2, p3, u, 0.5);
      appendDedup(out, pt);
    }
  }

  return out;
}

/**
 * Nearest point on the same smoothed polyline used for route rendering (for snapping stations, etc.).
 * @param {number[][]} coords LineString coordinates
 * @param {number[]} lngLat [lng, lat]
 */
export function nearestPointOnSmoothedRoute(coords, lngLat) {
  if (!coords || coords.length < 2) return null;
  const smoothed = smoothLineStringForDisplay(coords);
  const line = smoothed?.length >= 2 ? turf.lineString(smoothed) : turf.lineString(coords);
  return turf.nearestPointOnLine(line, lngLat, { units: "meters" });
}

export function featureCollectionWithSmoothedLineStrings(fc) {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      if (f.geometry.type !== "LineString") return f;
      const c = f.geometry.coordinates;
      if (c.length < 2) return f;
      const smoothed = smoothLineStringForDisplay(c);
      return {
        ...f,
        geometry: { type: "LineString", coordinates: smoothed },
      };
    }),
  };
}

export function tempLineFeaturesWithSmoothedGeometry(features) {
  return features.map((f) => {
    const c = f.geometry.coordinates;
    if (c.length < 2) return f;
    return {
      ...f,
      geometry: { type: "LineString", coordinates: smoothLineStringForDisplay(c) },
    };
  });
}

/**
 * Map display only: snap station points to the same smoothed polyline used for route rendering,
 * so markers sit on the visible curve. Does not mutate store or exported GeoJSON.
 */
export function featureCollectionStationsSnappedToSmoothedRoutes(stationsFC, routesFC) {
  const smoothedByRouteId = new Map();
  for (const f of routesFC.features) {
    if (f.geometry?.type !== "LineString") continue;
    const c = f.geometry.coordinates;
    if (c.length < 2) continue;
    const rid = f.properties?.route_id;
    if (rid == null) continue;
    smoothedByRouteId.set(rid, smoothLineStringForDisplay(c));
  }

  const getLabelPlacementByRouteDirection = (coords, segmentIndex) => {
    const i = Number.isFinite(segmentIndex) ? segmentIndex : 0;
    const from = coords[i];
    const to = coords[Math.min(i + 1, coords.length - 1)];
    if (!from || !to) return { anchor: "right", radialOffset: 0.9 };
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    if (len < EPS) return { anchor: "top", radialOffset: 1.05 };

    // Use the local normal direction so text sits away from the route.
    const nx = -dy / len;
    const ny = dx / len;
    const anx = Math.abs(nx);
    const any = Math.abs(ny);

    // 8-way anchor mapping + a few extra thresholds for near-axis cases.
    let anchor = "top-right";
    if (any >= 0.93) {
      anchor = ny >= 0 ? "top" : "bottom";
    } else if (anx >= 0.93) {
      anchor = nx >= 0 ? "right" : "left";
    } else if (any >= 0.68 && anx <= 0.45) {
      anchor = ny >= 0 ? "top" : "bottom";
    } else if (anx >= 0.68 && any <= 0.45) {
      anchor = nx >= 0 ? "right" : "left";
    } else if (nx >= 0 && ny >= 0) {
      anchor = "top-right";
    } else if (nx < 0 && ny >= 0) {
      anchor = "top-left";
    } else if (nx < 0 && ny < 0) {
      anchor = "bottom-left";
    } else {
      anchor = "bottom-right";
    }

    // More offset for near-horizontal route segments to avoid touching the line.
    const horizontalRatio = Math.abs(dx) / (Math.abs(dy) + EPS);
    const radialOffset = horizontalRatio > 2.2 ? 1.2 : horizontalRatio > 1.4 ? 1.05 : 0.9;

    return { anchor, radialOffset };
  };

  return {
    type: "FeatureCollection",
    features: stationsFC.features.map((st) => {
      if (st.properties?.is_transfer_fixed) {
        return {
          ...st,
          properties: {
            ...st.properties,
          },
          geometry: {
            type: "Point",
            coordinates: st.geometry.coordinates,
          },
        };
      }
      const rid = st.properties?.route_id;
      const smoothed = smoothedByRouteId.get(rid);
      if (!smoothed || smoothed.length < 2) return st;
      const line = turf.lineString(smoothed);
      const snapped = turf.nearestPointOnLine(line, st.geometry.coordinates, { units: "meters" });
      const placement = getLabelPlacementByRouteDirection(smoothed, snapped.properties?.segmentIndex);
      return {
        ...st,
        properties: {
          ...st.properties,
          label_anchor: placement.anchor,
          label_offset: placement.radialOffset,
        },
        geometry: {
          type: "Point",
          coordinates: snapped.geometry.coordinates,
        },
      };
    }),
  };
}

/**
 * Build display-only station circles + label points.
 * - station circles: snapped to smoothed route
 * - station labels: use per-station dragged label position when available
 */
export function buildStationDisplayCollections(stationsFC, routesFC) {
  const stationsDisplayFC = featureCollectionStationsSnappedToSmoothedRoutes(stationsFC, routesFC);
  const displayByStationId = new Map();
  for (const st of stationsDisplayFC.features) {
    displayByStationId.set(st.properties?.station_id, st);
  }

  const stationLabelsFC = {
    type: "FeatureCollection",
    features: stationsFC.features.map((st) => {
      const sid = st.properties?.station_id;
      const displayFeature = displayByStationId.get(sid);
      const snappedCoord = displayFeature?.geometry?.coordinates || st.geometry.coordinates;
      return {
        ...st,
        properties: {
          ...displayFeature?.properties,
          ...st.properties,
        },
        geometry: {
          type: "Point",
          coordinates: snappedCoord,
        },
      };
    }),
  };

  return { stationsDisplayFC, stationLabelsFC };
}
