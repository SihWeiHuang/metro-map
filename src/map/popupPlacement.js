/** Gap between the pointer and the popup edge (px). */
const GAP_PX = 14;
const VIEW_PADDING_PX = 8;
/** Keep popups clear of hovered station circles / line hit area. */
const FEATURE_CLEAR_RADIUS_PX = 14;
/** Layers to avoid when placing cursor-adjacent popups. */
const POPUP_COLLISION_LAYERS = [
  "routes-line",
  "routes-line-hover",
  "stations-circle",
  "stations-circle-hover",
  "transfer-stations-circle",
  "transfer-stations-circle-hover",
  "stations-label",
  "stations-label-hover",
];
const STATION_COLLISION_WEIGHT = 90;
const ROUTE_COLLISION_WEIGHT = 45;
/** Evenly spaced directions (8, 16, …). More directions = finer placement near corners. */
const POPUP_DIRECTION_COUNT = 16;

function buildDirectionCandidates(count) {
  return Array.from({ length: count }, (_, i) => ({
    anchor: "center",
    // First candidate points up; then clockwise in screen space (x right, y down).
    angle: (i / count) * 2 * Math.PI - Math.PI / 2,
  }));
}

const DIRECTION_CANDIDATES = buildDirectionCandidates(POPUP_DIRECTION_COUNT);

/** Offset for center-anchored popup so the near edge clears the pointer by GAP_PX. */
function centerOffsetForAngle(angle, width, height) {
  const hw = width / 2;
  const hh = height / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dist = GAP_PX + hw * Math.abs(cos) + hh * Math.abs(sin);
  return [cos * dist, sin * dist];
}

function estimateRect(point, anchor, offset, width, height) {
  const [ox, oy] = offset;
  const { x, y } = point;
  const hw = width / 2;
  const hh = height / 2;
  if (anchor === "center") {
    return { x: x + ox - hw, y: y + oy - hh, w: width, h: height };
  }
  return { x: x + ox - hw, y: y + oy - hh, w: width, h: height };
}

function fitsViewport(rect, viewW, viewH) {
  return (
    rect.x >= VIEW_PADDING_PX &&
    rect.y >= VIEW_PADDING_PX &&
    rect.x + rect.w <= viewW - VIEW_PADDING_PX &&
    rect.y + rect.h <= viewH - VIEW_PADDING_PX
  );
}

function roomAlongAngle(angle, point, viewW, viewH) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const roomRight = viewW - point.x;
  const roomLeft = point.x;
  const roomDown = viewH - point.y;
  const roomUp = point.y;
  return (
    Math.max(0, cos) * roomRight +
    Math.max(0, -cos) * roomLeft +
    Math.max(0, sin) * roomDown +
    Math.max(0, -sin) * roomUp
  );
}

function scoreCandidate(map, candidate, point, viewW, viewH, estWidth, estHeight, opts = {}) {
  const featureClearRadius = opts.featureClearRadius ?? FEATURE_CLEAR_RADIUS_PX;
  const offset = centerOffsetForAngle(candidate.angle, estWidth, estHeight);
  const rect = estimateRect(point, candidate.anchor, offset, estWidth, estHeight);
  let score = 0;
  if (fitsViewport(rect, viewW, viewH)) score += 1000;
  else {
    const overflow =
      Math.max(0, VIEW_PADDING_PX - rect.x) +
      Math.max(0, VIEW_PADDING_PX - rect.y) +
      Math.max(0, rect.x + rect.w - (viewW - VIEW_PADDING_PX)) +
      Math.max(0, rect.y + rect.h - (viewH - VIEW_PADDING_PX));
    score -= overflow * 4;
  }
  if (overlapsFeature(point, rect, featureClearRadius)) score -= 500;
  score -= mapFeatureCollisionPenalty(map, rect);
  score += roomAlongAngle(candidate.angle, point, viewW, viewH);
  if (opts.upwardBias) score += -Math.sin(candidate.angle) * 24;
  return score;
}

function overlapsFeature(point, rect, radiusPx = FEATURE_CLEAR_RADIUS_PX) {
  const closestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.h));
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  const r = radiusPx;
  return dx * dx + dy * dy < r * r;
}

function featureCollisionKey(feature) {
  const layerId = feature.layer?.id ?? "";
  const props = feature.properties ?? {};
  const id =
    props.station_id ??
    props.subroute_id ??
    props.route_id ??
    feature.id ??
    "";
  return `${layerId}:${id}`;
}

function mapFeatureCollisionPenalty(map, rect) {
  if (!map) return 0;
  const layers = POPUP_COLLISION_LAYERS.filter((id) => map.getLayer(id));
  if (!layers.length) return 0;

  const x1 = Math.max(0, Math.floor(rect.x));
  const y1 = Math.max(0, Math.floor(rect.y));
  const x2 = Math.ceil(rect.x + rect.w);
  const y2 = Math.ceil(rect.y + rect.h);
  if (x2 <= x1 || y2 <= y1) return 0;

  let features;
  try {
    features = map.queryRenderedFeatures(
      [
        [x1, y1],
        [x2, y2],
      ],
      { layers }
    );
  } catch {
    return 0;
  }

  const seen = new Set();
  let penalty = 0;
  for (const feature of features) {
    const key = featureCollisionKey(feature);
    if (seen.has(key)) continue;
    seen.add(key);
    const layerId = feature.layer?.id ?? "";
    if (layerId.includes("stations")) penalty += STATION_COLLISION_WEIGHT;
    else if (layerId.includes("routes")) penalty += ROUTE_COLLISION_WEIGHT;
  }
  return penalty;
}

function pickBestCandidate(map, point, candidates, estWidth, estHeight, scoreOpts = {}) {
  const viewW = map.getCanvas().clientWidth;
  const viewH = map.getCanvas().clientHeight;
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = scoreCandidate(map, candidate, point, viewW, viewH, estWidth, estHeight, scoreOpts);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Pick Mapbox Popup anchor/offset so the popup sits beside the pointer, not on the feature.
 * @param {import("mapbox-gl").Map} map
 * @param {{ x: number, y: number }} point
 * @param {{ estWidth?: number, estHeight?: number, directionCount?: number }} [opts]
 * @returns {{ anchor: string, offset: [number, number] }}
 */
export function resolvePopupPlacement(map, point, opts = {}) {
  const estWidth = opts.estWidth ?? 220;
  const estHeight = opts.estHeight ?? 80;
  const directionCount = opts.directionCount ?? POPUP_DIRECTION_COUNT;
  const candidates =
    directionCount === POPUP_DIRECTION_COUNT && DIRECTION_CANDIDATES.length === directionCount
      ? DIRECTION_CANDIDATES
      : buildDirectionCandidates(directionCount);

  const best = pickBestCandidate(map, point, candidates, estWidth, estHeight);
  return {
    anchor: best.anchor,
    offset: centerOffsetForAngle(best.angle, estWidth, estHeight),
  };
}

/**
 * @param {import("mapbox-gl").Map} map
 * @param {import("mapbox-gl").LngLatLike} lngLat
 * @param {{ x: number, y: number } | undefined} point
 */
export function popupScreenPoint(map, lngLat, point) {
  if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) return point;
  const projected = map.project(lngLat);
  return { x: projected.x, y: projected.y };
}
