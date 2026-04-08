import {
  buildStationDisplayCollections,
  featureCollectionWithSmoothedLineStrings,
} from "./displayLineSmoothing.js";
import { STATION_LABEL_FRAME_IMAGE_ID } from "./labelMoveFrameImage.js";

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

  addOrSetSource("routes", featureCollectionWithSmoothedLineStrings(store.routesFC));
  const { stationsDisplayFC, stationLabelsFC } = buildStationDisplayCollections(store.stationsFC, store.routesFC);
  addOrSetSource("stations", stationsDisplayFC);
  addOrSetSource("station-labels", stationLabelsFC);
  addOrSetSource("transfer-snaps", { type: "FeatureCollection", features: [] });
  addOrSetSource("temp-edit-line", { type: "FeatureCollection", features: [] });
  addOrSetSource("temp-edit-nodes", { type: "FeatureCollection", features: [] });
  addOrSetSource("label-drag-limit", { type: "FeatureCollection", features: [] });

  if (!map.getLayer("routes-line")) {
    map.addLayer({
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
  }

  if (!map.getLayer("routes-line-hover")) {
    map.addLayer({
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
  }

  if (!map.getLayer("stations-circle")) {
    map.addLayer({
      id: "stations-circle",
      type: "circle",
      source: "stations",
      paint: {
        "circle-radius": ["case", ["==", ["get", "is_transfer_fixed"], true], 9.5, 8],
        "circle-color": ["case", ["==", ["get", "is_transfer_fixed"], true], "#ffffff", ["coalesce", ["get", "color"], "#1e88e5"]],
        "circle-stroke-width": ["case", ["==", ["get", "is_transfer_fixed"], true], 2.8, 1.5],
        "circle-stroke-color": ["case", ["==", ["get", "is_transfer_fixed"], true], "#000000", "#ffffff"],
      },
    });
  }

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
    map.addLayer({
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
    map.addLayer({
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
    map.addLayer({
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

  if (!map.getLayer("stations-circle-hover")) {
    map.addLayer({
      id: "stations-circle-hover",
      type: "circle",
      source: "stations",
      paint: {
        "circle-radius": ["case", ["==", ["get", "is_transfer_fixed"], true], 14, 12],
        "circle-color": ["case", ["==", ["get", "is_transfer_fixed"], true], "#ffffff", ["coalesce", ["get", "color"], "#1e88e5"]],
        "circle-stroke-width": ["case", ["==", ["get", "is_transfer_fixed"], true], 3, 2],
        "circle-stroke-color": ["case", ["==", ["get", "is_transfer_fixed"], true], "#000000", "#ffffff"],
      },
      filter: ["==", ["get", "route_id"], ""],
    });
  }

  if (!map.getLayer("transfer-snaps-layer")) {
    map.addLayer({
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
  }

  if (!map.getLayer("temp-edit-line-layer")) {
    map.addLayer({
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
    map.addLayer({
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
    if (map.getLayer("temp-edit-line-layer")) {
      map.moveLayer("temp-edit-line-layer", "temp-edit-nodes-layer");
    }
  }

  if (!map.getLayer("label-drag-limit-layer")) {
    map.addLayer({
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
}
