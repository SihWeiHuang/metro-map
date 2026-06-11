import {
  getLayerFilter,
  hasLayer,
  setLayerFilter,
  setMapLayoutProperty,
  setMapPaintProperty,
} from "../map-runtime/mapAdapter.js";

/**
 * 車站站名 symbol 碰撞／閃避（Mapbox layout）。
 * 0 = 不閃避（強制顯示）；100 = 最嚴格。預設 55：站名優先於底圖文字、站間適度排開；站名不會被擠掉（text-optional: false）。
 */

export const STATION_LABEL_COLLISION_LEVEL = 55;

export const STATION_LABEL_COLLISION_LAYER_IDS = ["stations-label", "stations-label-hover"];

/** 移動站名子模式／拖曳站名時：含外框圖層，一律允許重疊顯示。 */
export const STATION_LABEL_DRAG_LAYER_IDS = [
  "stations-label",
  "stations-label-hover",
  "stations-label-move-frame",
];

/** 拖曳站點／站名時暫時關閉閃避，避免標籤被藏起來。 */
export const STATION_LABEL_DRAG_LAYOUT = {
  "text-allow-overlap": true,
  "text-ignore-placement": true,
  "text-optional": false,
  "text-padding": 0,
};

const EMPTY_STATION_FILTER = ["==", ["get", "station_id"], ""];

/** @type {string[]} */
let activeRouteHoverSubrouteIds = [];
/** @type {unknown[] | null} */
let stationLabelVisibilityFilter = null;

/**
 * @param {number} [level] 0–100
 * @returns {Record<string, boolean | number>}
 */
export function getStationLabelCollisionLayout(level = STATION_LABEL_COLLISION_LEVEL) {
  const n = Math.max(0, Math.min(100, Math.round(Number(level) || 0)));

  if (n === 0) {
    return {
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-optional": false,
      "text-padding": 0,
      "symbol-sort-key": 100,
    };
  }

  const padding = Math.max(1, Math.min(6, Math.round(1 + (n / 100) * 2)));
  const sortKey = 100 + Math.round(n * 2);

  return {
    "text-allow-overlap": n < 20,
    "text-ignore-placement": n < 10,
    "text-optional": false,
    "text-padding": padding,
    "symbol-sort-key": sortKey,
  };
}

/** 底圖主要地名（不含路名）：碰撞時可讓位給捷運圖層（由 layers.js 套用）。 */
export const BASEMAP_PLACE_TEXT_COLLISION_YIELD = {
  "text-optional": true,
  "symbol-sort-key": 1,
};

/** @deprecated 使用 BASEMAP_PLACE_TEXT_COLLISION_YIELD */
export const BASEMAP_TEXT_COLLISION_YIELD = BASEMAP_PLACE_TEXT_COLLISION_YIELD;
export const CORE_PLACE_BASEMAP_COLLISION_YIELD = BASEMAP_PLACE_TEXT_COLLISION_YIELD;

function applyLayoutToLayers(map, layerIds, layout) {
  if (!map) return;
  for (const layerId of layerIds) {
    if (!hasLayer(map, layerId)) continue;
    for (const [key, value] of Object.entries(layout)) {
      try {
        setMapLayoutProperty(map, layerId, key, value);
      } catch {
        /* ignore */
      }
    }
  }
}

/** 比對 hover 路線上的站點／站名（含 transfer_routes）。 */
function buildHoveredSubrouteMatchExpr(subrouteIds) {
  const ids = subrouteIds.filter((id) => typeof id === "string" && id !== "");
  if (!ids.length) return null;
  const transferAny = [
    "any",
    ...ids.map((rid) => ["in", rid, ["coalesce", ["get", "transfer_routes"], ["literal", []]]]),
  ];
  return ["any", ["in", ["get", "subroute_id"], ["literal", ids]], transferAny];
}

function hideRouteHoverLabelLayer(map) {
  setLayerFilter(map, "stations-label-hover", EMPTY_STATION_FILTER);
}

function applyRouteHoverLabelFilters(map, hoveredSubrouteIds, level = STATION_LABEL_COLLISION_LEVEL) {
  const matchExpr = buildHoveredSubrouteMatchExpr(hoveredSubrouteIds);
  if (!matchExpr) return;

  const base = stationLabelVisibilityFilter ?? true;

  applyLayoutToLayers(map, ["stations-label"], getStationLabelCollisionLayout(level));
  applyLayoutToLayers(map, ["stations-label-hover"], STATION_LABEL_DRAG_LAYOUT);

  setLayerFilter(map, "stations-label", ["all", base, ["!", matchExpr]]);
  setLayerFilter(map, "stations-label-hover", ["all", base, matchExpr]);
}

/** @returns {string[]} */
export function getActiveRouteHoverSubrouteIds() {
  return [...activeRouteHoverSubrouteIds];
}

/** 清除路線 hover 站名分流狀態，但不還原 stations-label 可見性 filter（編輯路線隱藏時用）。 */
export function clearRouteHoverLabelState(map, level = STATION_LABEL_COLLISION_LEVEL) {
  activeRouteHoverSubrouteIds = [];
  stationLabelVisibilityFilter = null;
  applyLayoutToLayers(map, STATION_LABEL_COLLISION_LAYER_IDS, getStationLabelCollisionLayout(level));
  hideRouteHoverLabelLayer(map);
}

function clearRouteHoverLabelFilters(map, level = STATION_LABEL_COLLISION_LEVEL) {
  activeRouteHoverSubrouteIds = [];
  const base = stationLabelVisibilityFilter;
  stationLabelVisibilityFilter = null;

  applyLayoutToLayers(map, STATION_LABEL_COLLISION_LAYER_IDS, getStationLabelCollisionLayout(level));
  hideRouteHoverLabelLayer(map);

  if (base && hasLayer(map, "stations-label")) {
    setLayerFilter(map, "stations-label", base);
  }
}

/**
 * 路線可見性 filter 更新後，重新套用 hover 分流（避免被 applyHiddenSubrouteVisibility 覆蓋）。
 * @param {import("../map-runtime/mapTypes.js").MapLike | null | undefined} map
 * @param {unknown[] | null | undefined} [visibilityFilter]
 */
export function syncStationLabelRouteHoverFilters(map, visibilityFilter) {
  if (!map || !activeRouteHoverSubrouteIds.length) return;
  if (visibilityFilter) {
    stationLabelVisibilityFilter = visibilityFilter;
  }
  applyRouteHoverLabelFilters(map, activeRouteHoverSubrouteIds);
}

export function applyStationLabelCollision(map, level = STATION_LABEL_COLLISION_LEVEL) {
  if (activeRouteHoverSubrouteIds.length) {
    applyLayoutToLayers(map, STATION_LABEL_COLLISION_LAYER_IDS, getStationLabelCollisionLayout(level));
    applyRouteHoverLabelFilters(map, activeRouteHoverSubrouteIds, level);
    return;
  }
  applyLayoutToLayers(map, STATION_LABEL_COLLISION_LAYER_IDS, getStationLabelCollisionLayout(level));
}

/**
 * 路線 hover 時：該路線站名強制顯示（關閉智慧閃避），其餘路線維持原碰撞設定。
 * Mapbox layout 不支援 data expression，改以 stations-label-hover 圖層分流。
 * @param {import("../map-runtime/mapTypes.js").MapLike | null | undefined} map
 * @param {string[]} [hoveredSubrouteIds]
 * @param {number} [level]
 */
export function applyStationLabelCollisionForRouteHover(map, hoveredSubrouteIds = [], level = STATION_LABEL_COLLISION_LEVEL) {
  if (!map) return;
  const ids = hoveredSubrouteIds.filter((id) => typeof id === "string" && id !== "");

  if (!ids.length) {
    clearRouteHoverLabelFilters(map, level);
  } else {
    if (!activeRouteHoverSubrouteIds.length && hasLayer(map, "stations-label")) {
      stationLabelVisibilityFilter = getLayerFilter(map, "stations-label");
    }
    activeRouteHoverSubrouteIds = ids;
    applyRouteHoverLabelFilters(map, ids, level);
  }

  if (hasLayer(map, "stations-label")) {
    try {
      setMapPaintProperty(map, "stations-label", "text-opacity", 1);
    } catch {
      /* ignore */
    }
  }
  if (hasLayer(map, "stations-label-hover")) {
    try {
      setMapPaintProperty(map, "stations-label-hover", "text-opacity", 1);
    } catch {
      /* ignore */
    }
  }
}

export function applyStationLabelDragPlacement(map) {
  activeRouteHoverSubrouteIds = [];
  stationLabelVisibilityFilter = null;
  applyLayoutToLayers(map, STATION_LABEL_DRAG_LAYER_IDS, STATION_LABEL_DRAG_LAYOUT);
  hideRouteHoverLabelLayer(map);
  if (hasLayer(map, "stations-label")) {
    try {
      setMapPaintProperty(map, "stations-label", "text-opacity", 1);
    } catch {
      /* ignore */
    }
  }
}
