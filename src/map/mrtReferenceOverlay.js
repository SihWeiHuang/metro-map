/**
 * TEMP — official Taipei MRT geometry as a gray underlay while tuning fitted defaults.
 *
 * Enable: VITE_MRT_REFERENCE_OVERLAY=true (or `npm run dev:reference`)
 * Remove when done: see docs/TEMP_MRT_REFERENCE_OVERLAY.md
 */
import referenceImportData from "../default-routes/taipei-mrt-import-reference-temp.json";
import { featureCollectionWithSmoothedLineStrings } from "./displayLineSmoothing.js";

export const MRT_REFERENCE_OVERLAY_ENABLED = import.meta.env.VITE_MRT_REFERENCE_OVERLAY === "true";

export const MRT_REFERENCE_SOURCE_ID = "mrt-reference-routes";
export const MRT_REFERENCE_LAYER_ID = "mrt-reference-line";
export const MRT_REFERENCE_STATIONS_SOURCE_ID = "mrt-reference-stations";
export const MRT_REFERENCE_STATIONS_LAYER_ID = "mrt-reference-stations-circle";

/** Near-black deep gray underlay (main routes use ~6px / #1e88e5). */
const REFERENCE_LINE_COLOR = "#262626";
const REFERENCE_LINE_WIDTH = 8;
const REFERENCE_LINE_OPACITY = 0.78;

const REFERENCE_STATION_COLOR = "#262626";
const REFERENCE_STATION_RADIUS = 9.5;
const REFERENCE_STATION_STROKE_COLOR = "#e8e8e8";
const REFERENCE_STATION_STROKE_WIDTH = 1.5;
const REFERENCE_STATION_OPACITY = 0.82;

let cachedReferenceRoutesFC = null;
let cachedReferenceStationsFC = null;

function buildReferenceRoutesFeatureCollection() {
  if (cachedReferenceRoutesFC) return cachedReferenceRoutesFC;
  const raw = referenceImportData?.userSubroutesFC ?? { type: "FeatureCollection", features: [] };
  const features = (raw.features || [])
    .filter((f) => f?.geometry?.type === "LineString" && Array.isArray(f.geometry.coordinates))
    .map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: { ...(f.properties || {}), _mrt_reference_overlay: true },
    }));
  cachedReferenceRoutesFC = { type: "FeatureCollection", features };
  return cachedReferenceRoutesFC;
}

function buildReferenceStationsFeatureCollection() {
  if (cachedReferenceStationsFC) return cachedReferenceStationsFC;
  const raw = referenceImportData?.userStationsFC ?? { type: "FeatureCollection", features: [] };
  const features = (raw.features || [])
    .filter((f) => f?.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates))
    .map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: { ...(f.properties || {}), _mrt_reference_overlay: true },
    }));
  cachedReferenceStationsFC = { type: "FeatureCollection", features };
  return cachedReferenceStationsFC;
}

export function getMrtReferenceRoutesDisplayFC() {
  return featureCollectionWithSmoothedLineStrings(buildReferenceRoutesFeatureCollection());
}

export function getMrtReferenceStationsFC() {
  return buildReferenceStationsFeatureCollection();
}

export function getMrtReferenceLayerPaint() {
  return {
    "line-color": REFERENCE_LINE_COLOR,
    "line-width": REFERENCE_LINE_WIDTH,
    "line-opacity": REFERENCE_LINE_OPACITY,
  };
}

export function getMrtReferenceStationsLayerPaint() {
  return {
    "circle-radius": REFERENCE_STATION_RADIUS,
    "circle-color": REFERENCE_STATION_COLOR,
    "circle-stroke-width": REFERENCE_STATION_STROKE_WIDTH,
    "circle-stroke-color": REFERENCE_STATION_STROKE_COLOR,
    "circle-opacity": REFERENCE_STATION_OPACITY,
  };
}
