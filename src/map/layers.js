import { MAPBOX_BASEMAP_LIGHT_PRESET } from "./basemapAppearanceConfig.js";
import {
  buildStationDisplayCollections,
  featureCollectionWithSmoothedLineStrings,
} from "./displayLineSmoothing.js";
import { STATION_LABEL_FRAME_IMAGE_ID } from "./labelMoveFrameImage.js";
import {
  applyStationLabelCollision,
  CORE_PLACE_BASEMAP_COLLISION_YIELD,
  getStationLabelCollisionLayout,
  STATION_LABEL_COLLISION_LEVEL,
} from "./stationLabelCollision.js";
import {
  getMrtReferenceLayerPaint,
  getMrtReferenceRoutesDisplayFC,
  getMrtReferenceStationsFC,
  getMrtReferenceStationsLayerPaint,
  isMrtReferenceOverlayActive,
  MRT_REFERENCE_LAYER_ID,
  MRT_REFERENCE_SOURCE_ID,
  MRT_REFERENCE_STATIONS_LAYER_ID,
  MRT_REFERENCE_STATIONS_SOURCE_ID,
} from "./mrtReferenceOverlay.js";

function metroRouteLayerIds() {
  return [
    ...(isMrtReferenceOverlayActive() ? [MRT_REFERENCE_LAYER_ID] : []),
    "routes-line",
    "routes-line-hover",
  ];
}

/** Above routes, still below basemap labels (bottom → top). */
function metroOverlayLayerIds() {
  return [
    ...(isMrtReferenceOverlayActive() ? [MRT_REFERENCE_STATIONS_LAYER_ID] : []),
    "stations-circle",
    "temp-edit-line-casing-layer",
    "temp-edit-line-layer",
    "temp-edit-line-hit-layer",
    "temp-edit-nodes-layer",
    "label-drag-limit-layer",
    "stations-label-move-frame",
    "stations-label",
  ];
}

/** Transient hover/edit overlays — kept above basemap labels and station hover circles. */
const METRO_HOVER_OVERLAY_LAYER_IDS = [
  "stations-circle-hover",
  "transfer-snaps-layer",
  "transfer-stations-circle",
  "transfer-stations-circle-hover",
  "stations-label-hover",
];

/** Recreated on each initializeLayers (hot reload). */
function metroRecreatedLayerIds() {
  return [
    ...metroRouteLayerIds(),
    ...(isMrtReferenceOverlayActive() ? [MRT_REFERENCE_STATIONS_LAYER_ID] : []),
    "stations-circle",
    "stations-circle-hover",
    "transfer-snaps-layer",
    "transfer-stations-circle",
    "transfer-stations-circle-hover",
  ];
}

function metroSourceIds() {
  return new Set([
    "routes",
    "stations",
    "station-labels",
    "transfer-snaps",
    "temp-edit-line",
    "temp-edit-nodes",
    "label-drag-limit",
    ...(isMrtReferenceOverlayActive() ? [MRT_REFERENCE_SOURCE_ID, MRT_REFERENCE_STATIONS_SOURCE_ID] : []),
  ]);
}

const REGULAR_STATION_LAYER_FILTER = ["!=", ["coalesce", ["get", "is_transfer_fixed"], false], true];
const TRANSFER_STATION_LAYER_FILTER = ["==", ["coalesce", ["get", "is_transfer_fixed"], false], true];
/**
 * Routes in `middle` (above roads, below 3D buildings; emissive paint avoids depth hide).
 * Points / nodes in `top` (above routes; GL batches line+circle in `middle` so circles get covered).
 */
const METRO_ROUTE_SLOT = "middle";
const METRO_OVERLAY_SLOT = "top";

export { REGULAR_STATION_LAYER_FILTER, TRANSFER_STATION_LAYER_FILTER };

function styleUsesMapboxSlots(map) {
  const style = map.getStyle();
  if (!style) return false;
  if (Array.isArray(style.imports) && style.imports.length > 0) return true;
  return style.layers?.some((layer) => layer.slot != null) ?? false;
}

const BUILDING_LAYER_RE = /building|structure|extrusion/i;

function isBuildingBasemapLayer(layer) {
  if (!layer) return false;
  if (layer.type === "fill-extrusion") return true;
  const id = (layer.id || "").toLowerCase();
  const sourceLayer = (layer["source-layer"] || "").toLowerCase();
  if (sourceLayer === "building" && (layer.type === "fill" || layer.type === "fill-extrusion")) return true;
  if (BUILDING_LAYER_RE.test(id) || BUILDING_LAYER_RE.test(sourceLayer)) return true;
  if (layer.type === "fill" && BUILDING_LAYER_RE.test(id)) return true;
  return false;
}

const LOW_PRIORITY_LABEL_ID_RE = /housenum|house-number|house_num|block-number|water-name|waterway-label/i;

function isLowPriorityMapLabelLayer(layer) {
  return LOW_PRIORITY_LABEL_ID_RE.test(layer.id || "");
}

function isPreferredMapLabelLayer(layer) {
  if (!isTextLabelBasemapLayer(layer) || isLowPriorityMapLabelLayer(layer)) return false;
  const id = (layer.id || "").toLowerCase();
  const sourceLayer = (layer["source-layer"] || "").toLowerCase();
  const hints = ["place", "poi", "road", "street", "settlement", "transit", "admin", "label", "name"];
  return hints.some((hint) => id.includes(hint) || sourceLayer.includes(hint));
}

function isTextLabelBasemapLayer(layer) {
  return layer.type === "symbol" && layer.layout?.["text-field"];
}

/** 保留：縣市、行政區等（不含里鄰／聚落級 place 圖層，避免與站名搶位） */
const CORE_PLACE_LABEL_RE =
  /place-(city|town|state|country|capital)|(?:^|[/_-])(admin|country|state|province|region|district|county|city|town|metropolis)(?:[/_-]|$)|^admin-/i;

/** 聚落、鄰里地名（石牌、唭哩岸等）— 與捷運站名重疊時以站名為主 */
const NEIGHBOURHOOD_PLACE_LABEL_RE =
  /(?:^|[/_-])(place|settlement)(?:[/_-]|$)|place-label|settlement-label|settlement-minor|place-neighbour|place-neighbor|place-suburb|place-village|place-hamlet|place-locality|place-quarter/i;

/** 保留：道路名稱文字 */
const ROAD_NAME_LABEL_RE =
  /road-label|road-name|road_label|street-label|street-name|street_label|(?:^|[/_-])(road|street)(?:[/_-]|$)|motorway|trunk|primary|secondary|tertiary|path|track|bridge|tunnel|ferry/i;

/** 一律隱藏：POI 文字、門牌、路盾圖示層等（不含路名，見 ROAD_NAME_LABEL_RE） */
const CLUTTER_BASEMAP_LABEL_RE =
  /poi|shop|store|retail|food|amenity|housenum|house-num|junction|exit|guide|arrow|transit|ferry-label|waterway|natural|landuse|park-label|airport|harbor|hospital|school|university|college|golf|stadium|museum|library|worship|commercial|industrial|minor|auxiliary|ref|label-dot|symbol-label|poi-|marker|brand|fuel|parking|entrance|building-number|block-/i;

/** 隱藏：里鄰、村落等過密的小地名（保留 CORE 層級即可） */
const LOCAL_PLACE_LABEL_RE = /suburb|neighbourhood|neighborhood|village|hamlet|locality|quarter|isolated|microhood|macrohood|block-group/i;

/** 底圖 POI / 設施圖示（非文字） */
const CLUTTER_BASEMAP_ICON_RE =
  /poi|shop|store|retail|food|amenity|marker|icon|dot|indicator|brand|fuel|parking|museum|hospital|school|stadium|golf|library|worship|commercial|industrial|entrance/i;

function layerLabelKey(layer) {
  return `${layer.id || ""} ${layer["source-layer"] || ""}`.toLowerCase();
}

function isMetroLayer(layer) {
  return metroSourceIds().has(layer.source);
}

function shouldHideBasemapTextLayer(layer) {
  if (!isTextLabelBasemapLayer(layer) || isMetroLayer(layer)) return false;
  const key = layerLabelKey(layer);
  if (CLUTTER_BASEMAP_LABEL_RE.test(key)) return true;
  if (LOCAL_PLACE_LABEL_RE.test(key)) return true;
  if (NEIGHBOURHOOD_PLACE_LABEL_RE.test(key)) return true;
  if (ROAD_NAME_LABEL_RE.test(key)) return false;
  if (CORE_PLACE_LABEL_RE.test(key)) return false;
  return true;
}

function shouldHideBasemapIconLayer(layer) {
  if (isMetroLayer(layer) || layer.type !== "symbol") return false;
  if (!layer.layout?.["icon-image"]) return false;
  const key = layerLabelKey(layer);
  if (CLUTTER_BASEMAP_ICON_RE.test(key)) return true;
  if (/road|shield|motorway|exit|junction|guide|arrow|ref|route|street/.test(key)) return true;
  return false;
}

function hideBasemapLayer(map, layerId, layer) {
  try {
    map.setLayoutProperty(layerId, "visibility", "none");
    return;
  } catch {
    /* Standard import layers may reject visibility */
  }
  if (layer?.type === "symbol") {
    try {
      if (layer.layout?.["text-field"]) map.setPaintProperty(layerId, "text-opacity", 0);
    } catch {
      /* ignore */
    }
    try {
      if (layer.layout?.["icon-image"]) map.setPaintProperty(layerId, "icon-opacity", 0);
    } catch {
      /* ignore */
    }
  }
}

function applyReducedBasemapTextDensity(map) {
  const layers = map.getStyle()?.layers;
  if (!Array.isArray(layers)) return;
  for (const layer of layers) {
    if (!shouldHideBasemapTextLayer(layer)) continue;
    hideBasemapLayer(map, layer.id, layer);
  }
}

function applyReducedBasemapIconDensity(map) {
  const layers = map.getStyle()?.layers;
  if (!Array.isArray(layers)) return;
  for (const layer of layers) {
    if (!shouldHideBasemapIconLayer(layer)) continue;
    hideBasemapLayer(map, layer.id, layer);
  }
}

function isCorePlaceBasemapTextLayer(layer) {
  if (!isTextLabelBasemapLayer(layer) || isMetroLayer(layer)) return false;
  return CORE_PLACE_LABEL_RE.test(layerLabelKey(layer));
}

/** 主要行政地名參與碰撞且優先級低於站名，重疊時可被擠掉。 */
function applyBasemapCorePlaceLabelCollisionYield(map, level = STATION_LABEL_COLLISION_LEVEL) {
  if (!map || level <= 0) return;
  const layers = map.getStyle()?.layers;
  if (!Array.isArray(layers)) return;
  for (const layer of layers) {
    if (!isCorePlaceBasemapTextLayer(layer)) continue;
    for (const [key, value] of Object.entries(CORE_PLACE_BASEMAP_COLLISION_YIELD)) {
      try {
        map.setLayoutProperty(layer.id, key, value);
      } catch {
        /* Standard import 圖層可能拒絕 runtime 修改 */
      }
    }
  }
}

/**
 * Mapbox Standard（含 imports）— 關閉 POI／底圖大眾運輸；保留路名與行政地名。
 * 自訂 Classic 樣式無 imports 時會靜默略過。
 */
function applyMapboxStandardBasemapConfig(map) {
  const imports = map.getStyle()?.imports;
  if (!Array.isArray(imports) || imports.length === 0) return;

  const importId = imports.find((item) => item.id === "basemap")?.id ?? imports[0]?.id;
  if (!importId) return;

  const configs = [
    ["showPointOfInterestLabels", false],
    ["showRoadLabels", true],
    ["showTransitLabels", false],
    ["showPlaceLabels", true],
  ];

  for (const [key, value] of configs) {
    try {
      map.setConfigProperty(importId, key, value);
    } catch {
      /* 非 Standard 或 import 尚未就緒 */
    }
  }

  if (typeof MAPBOX_BASEMAP_LIGHT_PRESET === "string" && MAPBOX_BASEMAP_LIGHT_PRESET) {
    try {
      map.setConfigProperty(importId, "lightPreset", MAPBOX_BASEMAP_LIGHT_PRESET);
    } catch {
      /* 自訂 Classic 樣式可能不支援 */
    }
  }
}

/** Classic 樣式（無 Standard import）時略調背景色，避免整圖過白。 */
function applyClassicBasemapBackgroundTone(map) {
  const imports = map.getStyle()?.imports;
  if (Array.isArray(imports) && imports.length > 0) return;

  const layers = map.getStyle()?.layers;
  if (!Array.isArray(layers)) return;

  for (const layer of layers) {
    if (layer.type !== "background" || isMetroLayer(layer)) continue;
    try {
      map.setPaintProperty(layer.id, "background-color", "#e9edf1");
    } catch {
      /* ignore */
    }
  }
}

/** 盡量減少底圖雜訊（文字、POI 圖示、Standard config）。 */
export function applyBasemapClutterReduction(map, { force = false } = {}) {
  if (!map?.getStyle) return;
  if (!force && map.__metroBasemapClutterApplied) return;
  applyMapboxStandardBasemapConfig(map);
  applyClassicBasemapBackgroundTone(map);
  applyReducedBasemapTextDensity(map);
  applyReducedBasemapIconDensity(map);
  applyBasemapCorePlaceLabelCollisionYield(map);
  applyStationLabelCollision(map);
  map.__metroBasemapClutterApplied = true;
}

export function resetBasemapClutterAppliedFlag(map) {
  if (map) map.__metroBasemapClutterApplied = false;
}

/** First basemap symbol layer with text — fallback insert anchor (classic styles). */
function findLabelAnchorLayerId(map) {
  const layers = map.getStyle()?.layers;
  if (!Array.isArray(layers)) return undefined;

  const labelHints = ["place", "poi", "road-label", "road-name", "settlement", "housenum", "transit"];
  for (const hint of labelHints) {
    const match = layers.find(
      (layer) => layer.type === "symbol" && layer.layout?.["text-field"] && layer.id.includes(hint)
    );
    if (match) return match.id;
  }

  for (const layer of layers) {
    if (layer.type === "symbol" && layer.layout?.["text-field"]) return layer.id;
  }
  for (const layer of layers) {
    if (layer.type === "symbol") return layer.id;
  }
  return undefined;
}

/**
 * Layer id to pass as `beforeId`: metro geometry renders below it, and above building layers.
 * Fixes routes hidden under building fill / 3D extrusions at high zoom.
 */
function findMetroGeometryInsertBeforeLayerId(map) {
  const layers = map.getStyle()?.layers;
  if (!Array.isArray(layers) || layers.length === 0) return findLabelAnchorLayerId(map);

  let topBuildingIndex = -1;
  for (let i = 0; i < layers.length; i++) {
    if (isBuildingBasemapLayer(layers[i])) topBuildingIndex = i;
  }

  const afterBuildings = (index) => topBuildingIndex < 0 || index > topBuildingIndex;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!afterBuildings(i) || !isPreferredMapLabelLayer(layer)) continue;
    return layer.id;
  }

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!afterBuildings(i) || !isTextLabelBasemapLayer(layer) || isLowPriorityMapLabelLayer(layer)) continue;
    return layer.id;
  }

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!afterBuildings(i) || !isTextLabelBasemapLayer(layer)) continue;
    return layer.id;
  }

  if (topBuildingIndex >= 0 && topBuildingIndex < layers.length - 1) {
    return layers[topBuildingIndex + 1].id;
  }

  return findLabelAnchorLayerId(map);
}

/** Reduce 3D building depth-test hiding lines and circles (Mapbox Standard). */
function withMetroVisibilityPaint(layerDef) {
  if (layerDef.type === "line") {
    return {
      ...layerDef,
      paint: {
        ...layerDef.paint,
        "line-emissive-strength": layerDef.paint?.["line-emissive-strength"] ?? 1,
        "line-occlusion-opacity": layerDef.paint?.["line-occlusion-opacity"] ?? 1,
      },
    };
  }
  if (layerDef.type === "circle") {
    return {
      ...layerDef,
      paint: {
        ...layerDef.paint,
        "circle-emissive-strength": layerDef.paint?.["circle-emissive-strength"] ?? 1,
        "circle-occlusion-opacity": layerDef.paint?.["circle-occlusion-opacity"] ?? 1,
      },
    };
  }
  return layerDef;
}

function removeLayerIfExists(map, layerId) {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
}

function addMetroRouteLayer(map, layerDef) {
  const def = withMetroVisibilityPaint(layerDef);
  const beforeId = findMetroGeometryInsertBeforeLayerId(map);
  const slottedDef = styleUsesMapboxSlots(map) ? { ...def, slot: METRO_ROUTE_SLOT } : def;

  if (beforeId) {
    try {
      map.addLayer(slottedDef, beforeId);
      return;
    } catch {
      // Cross-slot beforeId rejected; fall through to slot-only / default placement.
    }
  }

  if (styleUsesMapboxSlots(map)) {
    map.addLayer(slottedDef);
    return;
  }

  const fallbackBeforeId = findLabelAnchorLayerId(map);
  if (fallbackBeforeId) {
    try {
      map.addLayer(def, fallbackBeforeId);
      return;
    } catch {
      // ignore
    }
  }

  map.addLayer(def);
}

/** Overlays use `top` slot so circles/nodes draw above route lines in `middle`. */
function addMetroOverlayLayer(map, layerDef) {
  const def = withMetroVisibilityPaint(layerDef);
  const beforeId = findMetroGeometryInsertBeforeLayerId(map);
  const slottedDef = styleUsesMapboxSlots(map) ? { ...def, slot: METRO_OVERLAY_SLOT } : def;

  if (beforeId) {
    try {
      map.addLayer(slottedDef, beforeId);
      return;
    } catch {
      // Cross-slot beforeId rejected; fall through.
    }
  }

  map.addLayer(slottedDef);
}

function chainLayerOrder(map, layerIds) {
  for (let i = layerIds.length - 1; i > 0; i--) {
    const belowId = layerIds[i - 1];
    const aboveId = layerIds[i];
    if (!map.getLayer(belowId) || !map.getLayer(aboveId)) continue;
    try {
      map.moveLayer(belowId, aboveId);
    } catch {
      // Style may not allow moving between these layers.
    }
  }
}

/**
 * Keep normal metro layers below basemap labels; hover labels above them.
 * Standard: routes (`middle`) and overlays (`top`) are separate slots — chain within each.
 * Classic: one stack, chain routes then overlays, anchor normal layers below map labels.
 */
export function ensureMetroLayerStackOrder(map) {
  const mapLabelBeforeId = findMetroGeometryInsertBeforeLayerId(map);
  const usesSlots = styleUsesMapboxSlots(map);

  if (usesSlots) {
    chainLayerOrder(map, metroRouteLayerIds());
    chainLayerOrder(map, metroOverlayLayerIds());
    chainLayerOrder(map, METRO_HOVER_OVERLAY_LAYER_IDS);
  } else {
    chainLayerOrder(map, [...metroRouteLayerIds(), ...metroOverlayLayerIds()]);
    chainLayerOrder(map, METRO_HOVER_OVERLAY_LAYER_IDS);
  }

  const topAnchoredMetroId = usesSlots
    ? [...metroOverlayLayerIds()].reverse().find((id) => map.getLayer(id))
    : [...metroRouteLayerIds(), ...metroOverlayLayerIds()].reverse().find((id) => map.getLayer(id));

  if (topAnchoredMetroId && mapLabelBeforeId) {
    try {
      map.moveLayer(topAnchoredMetroId, mapLabelBeforeId);
    } catch {
      // ignore
    }
  }

  for (const layerId of METRO_HOVER_OVERLAY_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;
    try {
      map.moveLayer(layerId);
    } catch {
      // Style may not allow moving between slots; intra-slot order was already chained above.
    }
  }
}

function removeMetroRecreatedLayers(map) {
  for (const layerId of metroRecreatedLayerIds()) {
    removeLayerIfExists(map, layerId);
  }
}

// 專門定義與管理 Mapbox 的 Sources 和 Layers
export function initializeLayers(map, store) {
  if (!map) return;

  function addOrSetSource(id, data) {
    if (map.getSource(id)) {
      map.getSource(id).setData(data);
    } else {
      map.addSource(id, { type: "geojson", data });
    }
  }

  addOrSetSource("routes", featureCollectionWithSmoothedLineStrings(store.subroutesFC));
  const { stationsDisplayFC, stationLabelsFC } = buildStationDisplayCollections(store.stationsFC, store.subroutesFC);
  addOrSetSource("stations", stationsDisplayFC);
  addOrSetSource("station-labels", stationLabelsFC);
  addOrSetSource("transfer-snaps", { type: "FeatureCollection", features: [] });
  addOrSetSource("temp-edit-line", { type: "FeatureCollection", features: [] });
  addOrSetSource("temp-edit-nodes", { type: "FeatureCollection", features: [] });
  addOrSetSource("label-drag-limit", { type: "FeatureCollection", features: [] });

  // Always recreate route/geometry layers so slot / beforeId placement stays correct after hot reload.
  removeMetroRecreatedLayers(map);

  if (isMrtReferenceOverlayActive()) {
    addOrSetSource(MRT_REFERENCE_SOURCE_ID, getMrtReferenceRoutesDisplayFC());
    addOrSetSource(MRT_REFERENCE_STATIONS_SOURCE_ID, getMrtReferenceStationsFC());
    addMetroRouteLayer(map, {
      id: MRT_REFERENCE_LAYER_ID,
      type: "line",
      source: MRT_REFERENCE_SOURCE_ID,
      paint: getMrtReferenceLayerPaint(),
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
    });
    addMetroOverlayLayer(map, {
      id: MRT_REFERENCE_STATIONS_LAYER_ID,
      type: "circle",
      source: MRT_REFERENCE_STATIONS_SOURCE_ID,
      paint: getMrtReferenceStationsLayerPaint(),
    });
  } else {
    removeLayerIfExists(map, MRT_REFERENCE_LAYER_ID);
    removeLayerIfExists(map, MRT_REFERENCE_STATIONS_LAYER_ID);
    if (map.getSource(MRT_REFERENCE_SOURCE_ID)) map.removeSource(MRT_REFERENCE_SOURCE_ID);
    if (map.getSource(MRT_REFERENCE_STATIONS_SOURCE_ID)) map.removeSource(MRT_REFERENCE_STATIONS_SOURCE_ID);
  }

  addMetroRouteLayer(map, {
    id: "routes-line",
    type: "line",
    source: "routes",
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#1e88e5"],
      "line-width": 6,
    },
    filter: ["!", ["in", ["get", "subroute_id"], ["literal", Array.from(store.hiddenSubrouteIds)]]],
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
  });

  addMetroRouteLayer(map, {
    id: "routes-line-hover",
    type: "line",
    source: "routes",
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#1e88e5"],
      "line-width": 9,
    },
    filter: ["==", ["get", "subroute_id"], ""],
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
  });

  addMetroOverlayLayer(map, {
    id: "stations-circle",
    type: "circle",
    source: "stations",
    filter: REGULAR_STATION_LAYER_FILTER,
    paint: {
      "circle-radius": 7,
      "circle-color": ["coalesce", ["get", "color"], "#1e88e5"],
      "circle-stroke-width": 2.2,
      "circle-stroke-color": "#ffffff",
    },
  });

  addMetroOverlayLayer(map, {
    id: "stations-circle-hover",
    type: "circle",
    source: "stations",
    filter: ["all", REGULAR_STATION_LAYER_FILTER, ["==", ["get", "station_id"], ""]],
    paint: {
      "circle-radius": 9.5,
      "circle-color": ["coalesce", ["get", "color"], "#1e88e5"],
      "circle-stroke-width": 2.2,
      "circle-stroke-color": "#ffffff",
    },
  });

  addMetroOverlayLayer(map, {
    id: "transfer-snaps-layer",
    type: "circle",
    source: "transfer-snaps",
    paint: {
      "circle-radius": 5.5,
      "circle-color": "#fdd835",
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#5d4037",
    },
  });

  addMetroOverlayLayer(map, {
    id: "transfer-stations-circle",
    type: "circle",
    source: "stations",
    filter: TRANSFER_STATION_LAYER_FILTER,
    paint: {
      "circle-radius": 7.2,
      "circle-color": "#ffffff",
      "circle-stroke-width": 2.2,
      "circle-stroke-color": "#000000",
    },
  });

  addMetroOverlayLayer(map, {
    id: "transfer-stations-circle-hover",
    type: "circle",
    source: "stations",
    filter: ["all", TRANSFER_STATION_LAYER_FILTER, ["==", ["get", "station_id"], ""]],
    paint: {
      "circle-radius": 9.25,
      "circle-color": "#ffffff",
      "circle-stroke-width": 2.25,
      "circle-stroke-color": "#000000",
    },
  });

  ensureMetroLayerStackOrder(map);
  map.once("idle", () => ensureMetroLayerStackOrder(map));
  map.on("zoomend", () => ensureMetroLayerStackOrder(map));

  const stationLabelLayoutBase = {
    "text-field": ["coalesce", ["get", "name"], ["get", "station_id"]],
    "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
    "text-size": 14,
    "text-anchor": [
      "case",
      ["has", "label_offset_xy"],
      "center",
      ["coalesce", ["get", "label_anchor"], "right"],
    ],
    "text-radial-offset": [
      "case",
      ["has", "label_offset_xy"],
      0,
      ["coalesce", ["get", "label_offset"], 0.9],
    ],
    "text-offset": [
      "case",
      ["has", "label_offset_xy"],
      ["get", "label_offset_xy"],
      ["literal", [0, 0]],
    ],
  };

  if (!map.getLayer("stations-label-move-frame")) {
    addMetroOverlayLayer(map, {
      id: "stations-label-move-frame",
      type: "symbol",
      source: "station-labels",
      layout: {
        ...stationLabelLayoutBase,
        "icon-image": STATION_LABEL_FRAME_IMAGE_ID,
        "icon-text-fit": "both",
        "icon-text-fit-padding": [2, 2, 2, 2],
        "icon-allow-overlap": true,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        visibility: "none",
      },
      paint: {
        "text-opacity": 0,
        "icon-opacity": 1,
      },
    });
  }

  if (!map.getLayer("stations-label")) {
    addMetroOverlayLayer(map, {
      id: "stations-label",
      type: "symbol",
      source: "station-labels",
      layout: {
        ...stationLabelLayoutBase,
        ...getStationLabelCollisionLayout(),
      },
      paint: {
        "text-color": [
          "case",
          ["==", ["coalesce", ["get", "is_transfer_fixed"], false], true],
          "#000000",
          ["coalesce", ["get", "color"], "#1e88e5"],
        ],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.1,
        "text-opacity": 1,
        "text-opacity-transition": { duration: 0, delay: 0 },
      },
    });
  }

  if (!map.getLayer("stations-label-hover")) {
    addMetroOverlayLayer(map, {
      id: "stations-label-hover",
      type: "symbol",
      source: "station-labels",
      layout: {
        "text-field": ["coalesce", ["get", "name"], ["get", "station_id"]],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
        "text-size": 15,
        "text-anchor": [
          "case",
          ["has", "label_offset_xy"],
          "center",
          ["coalesce", ["get", "label_anchor"], "right"],
        ],
        "text-radial-offset": [
          "case",
          ["has", "label_offset_xy"],
          0,
          ["coalesce", ["get", "label_offset"], 0.9],
        ],
        "text-offset": [
          "case",
          ["has", "label_offset_xy"],
          ["get", "label_offset_xy"],
          ["literal", [0, 0]],
        ],
        ...getStationLabelCollisionLayout(),
      },
      paint: {
        "text-color": [
          "case",
          ["==", ["coalesce", ["get", "is_transfer_fixed"], false], true],
          "#000000",
          ["coalesce", ["get", "color"], "#1e88e5"],
        ],
        "text-halo-color": "#ffffff",
        "text-halo-width": 2.2,
        "text-opacity": 1,
        "text-opacity-transition": { duration: 0, delay: 0 },
      },
      filter: ["==", ["get", "station_id"], ""],
    });
  }

  const TEMP_EDIT_LINE_WIDTH = 6;
  const TEMP_EDIT_LINE_CASING_WIDTH = 13;
  /** Invisible pick target: 2px beyond white casing on each side. */
  const TEMP_EDIT_LINE_HIT_WIDTH = TEMP_EDIT_LINE_CASING_WIDTH + 4;

  if (!map.getLayer("temp-edit-line-casing-layer")) {
    addMetroOverlayLayer(map, {
      id: "temp-edit-line-casing-layer",
      type: "line",
      source: "temp-edit-line",
      paint: {
        "line-color": "#ffffff",
        "line-width": TEMP_EDIT_LINE_CASING_WIDTH,
        "line-opacity": 0.95,
      },
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }

  if (!map.getLayer("temp-edit-line-layer")) {
    addMetroOverlayLayer(map, {
      id: "temp-edit-line-layer",
      type: "line",
      source: "temp-edit-line",
      paint: {
        "line-color": "#7b1fa2",
        "line-width": TEMP_EDIT_LINE_WIDTH,
        "line-dasharray": [0.8, 1.2],
        "line-opacity": 0.95,
      },
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }

  if (!map.getLayer("temp-edit-line-hit-layer")) {
    addMetroOverlayLayer(map, {
      id: "temp-edit-line-hit-layer",
      type: "line",
      source: "temp-edit-line",
      paint: {
        "line-color": "#000000",
        "line-width": TEMP_EDIT_LINE_HIT_WIDTH,
        "line-opacity": 0,
      },
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }

  if (!map.getLayer("temp-edit-nodes-layer")) {
    addMetroOverlayLayer(map, {
      id: "temp-edit-nodes-layer",
      type: "circle",
      source: "temp-edit-nodes",
      paint: {
        "circle-radius": 7,
        "circle-color": "#ffb300",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#212121",
      },
    });
  }

  if (!map.getLayer("label-drag-limit-layer")) {
    addMetroOverlayLayer(map, {
      id: "label-drag-limit-layer",
      type: "line",
      source: "label-drag-limit",
      paint: {
        "line-color": "#ff9800",
        "line-width": 2,
        "line-opacity": 0.9,
      },
    });
  }

  ensureMetroLayerStackOrder(map);
}
