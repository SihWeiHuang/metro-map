import {
  buildStationDisplayCollections,
  featureCollectionWithSmoothedLineStrings,
} from "./displayLineSmoothing.js";
import { STATION_LABEL_FRAME_IMAGE_ID } from "./labelMoveFrameImage.js";

/** Bottom of the metro stack — anchored below basemap labels. */
const METRO_ROUTE_LAYER_IDS = ["routes-line", "routes-line-hover"];

/** Above routes, still below basemap labels (bottom → top). */
const METRO_OVERLAY_LAYER_IDS = [
  "stations-circle",
  "transfer-snaps-layer",
  "transfer-stations-circle",
  "temp-edit-line-layer",
  "temp-edit-nodes-layer",
  "label-drag-limit-layer",
  "stations-label-move-frame",
  "stations-label",
];

/** Transient hover layers — kept above basemap labels to avoid native POI labels covering hover text. */
const METRO_HOVER_OVERLAY_LAYER_IDS = [
  "stations-circle-hover",
  "transfer-stations-circle-hover",
  "stations-label-hover",
];
const METRO_ALL_LAYER_IDS = new Set([
  ...METRO_ROUTE_LAYER_IDS,
  ...METRO_OVERLAY_LAYER_IDS,
  ...METRO_HOVER_OVERLAY_LAYER_IDS,
  "temp-edit-line-layer",
  "temp-edit-nodes-layer",
]);

/** Recreated on each initializeLayers (hot reload). */
const METRO_RECREATED_LAYER_IDS = [
  ...METRO_ROUTE_LAYER_IDS,
  "stations-circle",
  "stations-circle-hover",
  "transfer-snaps-layer",
  "transfer-stations-circle",
  "transfer-stations-circle-hover",
];

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
const BASEMAP_HIDDEN_LABEL_ID_RE =
  /housenum|house-number|house_num|block-number|address|poi|transit|station|airport|natural|water|waterway|ferry|golf|park|landuse/i;
const BASEMAP_DIMMED_LABEL_ID_RE =
  /road|street|bridge|tunnel|path|pedestrian|service|minor|tertiary|secondary|motorway|trunk|primary|shield/i;
const BASEMAP_IMPORTANT_LABEL_ID_RE =
  /country|state|province|region|admin|place|settlement|city|town|village|locality|neighborhood|suburb/i;

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

function isMetroLayer(layer) {
  return METRO_ALL_LAYER_IDS.has(layer?.id);
}

function labelLayerSearchText(layer) {
  return `${layer?.id || ""} ${layer?.["source-layer"] || ""}`;
}

function setLayerPaintProperty(map, layer, property, value) {
  try {
    map.setPaintProperty(layer.id, property, value);
  } catch {
    // Some imported style layers are not mutable in all Mapbox styles.
  }
}

function setBasemapLabelLayerVisibility(map, layer, visibility) {
  try {
    map.setLayoutProperty(layer.id, "visibility", visibility);
  } catch {
    // Some imported style layers are not mutable in all Mapbox styles.
  }
}

/**
 * Lower basemap label density so metro lines read clearly:
 * - keep place/admin labels
 * - dim road labels
 * - hide POI/transit/water/natural/house-number labels
 */
export function applyBasemapLabelDensity(map) {
  const layers = map?.getStyle()?.layers;
  if (!Array.isArray(layers)) return;

  for (const layer of layers) {
    if (isMetroLayer(layer) || !isTextLabelBasemapLayer(layer)) continue;

    const labelText = labelLayerSearchText(layer);
    if (BASEMAP_IMPORTANT_LABEL_ID_RE.test(labelText)) {
      setBasemapLabelLayerVisibility(map, layer, "visible");
      continue;
    }

    if (BASEMAP_HIDDEN_LABEL_ID_RE.test(labelText)) {
      setBasemapLabelLayerVisibility(map, layer, "none");
      continue;
    }

    if (BASEMAP_DIMMED_LABEL_ID_RE.test(labelText)) {
      setBasemapLabelLayerVisibility(map, layer, "visible");
      setLayerPaintProperty(map, layer, "text-opacity", 0.45);
      if (layer.layout?.["icon-image"]) setLayerPaintProperty(map, layer, "icon-opacity", 0.35);
    }
  }
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
    chainLayerOrder(map, METRO_ROUTE_LAYER_IDS);
    chainLayerOrder(map, METRO_OVERLAY_LAYER_IDS);
    chainLayerOrder(map, METRO_HOVER_OVERLAY_LAYER_IDS);
  } else {
    chainLayerOrder(map, [...METRO_ROUTE_LAYER_IDS, ...METRO_OVERLAY_LAYER_IDS]);
    chainLayerOrder(map, METRO_HOVER_OVERLAY_LAYER_IDS);
  }

  const topAnchoredMetroId = usesSlots
    ? [...METRO_OVERLAY_LAYER_IDS].reverse().find((id) => map.getLayer(id))
    : [...METRO_ROUTE_LAYER_IDS, ...METRO_OVERLAY_LAYER_IDS].reverse().find((id) => map.getLayer(id));

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
  for (const layerId of METRO_RECREATED_LAYER_IDS) {
    removeLayerIfExists(map, layerId);
  }
}

// 專門定義與管理 Mapbox 的 Sources 和 Layers
export function initializeLayers(map, store) {
  if (!map) return;
  applyBasemapLabelDensity(map);

  function addOrSetSource(id, data) {
    if (map.getSource(id)) {
      map.getSource(id).setData(data);
    } else {
      map.addSource(id, { type: "geojson", data });
    }
  }

  addOrSetSource("routes", featureCollectionWithSmoothedLineStrings(store.routesFC));
  const { stationsDisplayFC, stationLabelsFC } = buildStationDisplayCollections(store.stationsFC, store.routesFC);
  addOrSetSource("stations", stationsDisplayFC);
  addOrSetSource("station-labels", stationLabelsFC);
  addOrSetSource("transfer-snaps", { type: "FeatureCollection", features: [] });
  addOrSetSource("temp-edit-line", { type: "FeatureCollection", features: [] });
  addOrSetSource("temp-edit-nodes", { type: "FeatureCollection", features: [] });
  addOrSetSource("label-drag-limit", { type: "FeatureCollection", features: [] });

  // Always recreate route/geometry layers so slot / beforeId placement stays correct after hot reload.
  removeMetroRecreatedLayers(map);

  addMetroRouteLayer(map, {
    id: "routes-line",
    type: "line",
    source: "routes",
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#1e88e5"],
      "line-width": 8,
    },
    filter: ["!", ["in", ["get", "route_id"], ["literal", Array.from(store.hiddenRouteIds)]]],
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
      "line-width": 12,
    },
    filter: ["==", ["get", "route_id"], ""],
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
      "circle-radius": 8,
      "circle-color": ["coalesce", ["get", "color"], "#1e88e5"],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  });

  addMetroOverlayLayer(map, {
    id: "stations-circle-hover",
    type: "circle",
    source: "stations",
    filter: ["all", REGULAR_STATION_LAYER_FILTER, ["==", ["get", "station_id"], ""]],
    paint: {
      "circle-radius": 12,
      "circle-color": ["coalesce", ["get", "color"], "#1e88e5"],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  addMetroOverlayLayer(map, {
    id: "transfer-snaps-layer",
    type: "circle",
    source: "transfer-snaps",
    paint: {
      "circle-radius": 5,
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
      "circle-radius": 9.5,
      "circle-color": "#ffffff",
      "circle-stroke-width": 2.8,
      "circle-stroke-color": "#000000",
    },
  });

  addMetroOverlayLayer(map, {
    id: "transfer-stations-circle-hover",
    type: "circle",
    source: "stations",
    filter: ["all", TRANSFER_STATION_LAYER_FILTER, ["==", ["get", "station_id"], ""]],
    paint: {
      "circle-radius": 14,
      "circle-color": "#ffffff",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#000000",
    },
  });

  ensureMetroLayerStackOrder(map);
  map.once("idle", () => {
    applyBasemapLabelDensity(map);
    ensureMetroLayerStackOrder(map);
  });
  map.on("zoomend", () => ensureMetroLayerStackOrder(map));

  const stationLabelLayoutBase = {
    "text-field": ["coalesce", ["get", "name"], ["get", "station_id"]],
    "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
    "text-size": 12,
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
        "text-allow-overlap": false,
        "text-ignore-placement": false,
      },
      paint: {
        "text-color": ["coalesce", ["get", "color"], "#1e88e5"],
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
        "text-size": 13,
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
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": ["coalesce", ["get", "color"], "#1e88e5"],
        "text-halo-color": "#ffffff",
        "text-halo-width": 2.2,
        "text-opacity": 1,
        "text-opacity-transition": { duration: 0, delay: 0 },
      },
      filter: ["==", ["get", "station_id"], ""],
    });
  }

  if (!map.getLayer("temp-edit-line-layer")) {
    addMetroOverlayLayer(map, {
      id: "temp-edit-line-layer",
      type: "line",
      source: "temp-edit-line",
      paint: {
        "line-color": "#d81b60",
        "line-width": 6,
      },
    });
  }

  if (!map.getLayer("temp-edit-nodes-layer")) {
    addMetroOverlayLayer(map, {
      id: "temp-edit-nodes-layer",
      type: "circle",
      source: "temp-edit-nodes",
      paint: {
        "circle-radius": 6,
        "circle-color": "#d81b60",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff",
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
