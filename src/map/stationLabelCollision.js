/**
 * 車站站名 symbol 碰撞／閃避（Mapbox layout）。
 * 0 = 不閃避（強制顯示）；100 = 最嚴格。預設 55：站名優先於底圖（含主要地名）、站間適度排開。
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
    "text-optional": n >= 35,
    "text-padding": padding,
    "symbol-sort-key": sortKey,
  };
}

/** 底圖縣市／行政區等主要地名：碰撞時可讓位給站名（由 layers.js 套用）。 */
export const CORE_PLACE_BASEMAP_COLLISION_YIELD = {
  "text-optional": true,
  "symbol-sort-key": 1,
};

function applyLayoutToLayers(map, layerIds, layout) {
  if (!map) return;
  for (const layerId of layerIds) {
    if (!map.getLayer(layerId)) continue;
    for (const [key, value] of Object.entries(layout)) {
      try {
        map.setLayoutProperty(layerId, key, value);
      } catch {
        /* ignore */
      }
    }
  }
}

export function applyStationLabelCollision(map, level = STATION_LABEL_COLLISION_LEVEL) {
  applyLayoutToLayers(map, STATION_LABEL_COLLISION_LAYER_IDS, getStationLabelCollisionLayout(level));
}

export function applyStationLabelDragPlacement(map) {
  applyLayoutToLayers(map, STATION_LABEL_DRAG_LAYER_IDS, STATION_LABEL_DRAG_LAYOUT);
  if (map.getLayer("stations-label")) {
    try {
      map.setPaintProperty("stations-label", "text-opacity", 1);
    } catch {
      /* ignore */
    }
  }
}
