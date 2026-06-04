import * as turf from "@turf/turf";

export function getDisplayedStationCenter(map, stationId, fallbackCoord) {
  const src = map.getSource("stations");
  const data = src?._data;
  if (!data?.features) return fallbackCoord;
  const f = data.features.find((x) => x.properties?.station_id === stationId);
  const coords = f?.geometry?.coordinates;
  return Array.isArray(coords) ? coords : fallbackCoord;
}

export function setStationPreviewCoord(map, stationId, coord) {
  const stationsSrc = map.getSource("stations");
  const stationsData = stationsSrc?._data;
  if (!stationsData?.features) return false;
  const stF = stationsData.features.find((x) => x.properties?.station_id === stationId);
  if (!stF?.geometry) return false;

  const labelsSrc = map.getSource("station-labels");
  const labelsData = labelsSrc?._data;
  const lbF = labelsData?.features?.find((x) => x.properties?.station_id === stationId);

  const prev = stF.geometry.coordinates;
  const unchanged =
    Array.isArray(prev) &&
    prev.length >= 2 &&
    prev[0] === coord[0] &&
    prev[1] === coord[1] &&
    (!lbF?.geometry ||
      (lbF.geometry.coordinates[0] === coord[0] && lbF.geometry.coordinates[1] === coord[1]));

  if (unchanged) return true;

  stF.geometry.coordinates = coord;
  let labelsDirty = false;
  if (lbF?.geometry) {
    lbF.geometry.coordinates = coord;
    labelsDirty = true;
  }

  stationsSrc.setData(stationsData);
  if (labelsDirty && labelsSrc && labelsData) {
    labelsSrc.setData(labelsData);
  }
  return true;
}

const LABEL_TEXT_SIZE_PX = 12;

function labelOffsetFromCenterPx(map, center, targetCoord) {
  const cpx = map.project(center);
  const tpx = map.project(targetCoord);
  return [(tpx.x - cpx.x) / LABEL_TEXT_SIZE_PX, (tpx.y - cpx.y) / LABEL_TEXT_SIZE_PX];
}

/** 站名在螢幕上的實際位置（含 label_offset_xy）。 */
export function getStationLabelVisualCoord(map, stationId, dragCenter) {
  const src = map.getSource("station-labels");
  const f = src?._data?.features?.find((x) => x.properties?.station_id === stationId);
  const center = getDisplayedStationCenter(map, stationId, f?.geometry?.coordinates || dragCenter);
  const offset = f?.properties?.label_offset_xy;
  if (!Array.isArray(offset) || offset.length < 2) {
    return center;
  }
  const cpx = map.project(center);
  const labelPx = {
    x: cpx.x + offset[0] * LABEL_TEXT_SIZE_PX,
    y: cpx.y + offset[1] * LABEL_TEXT_SIZE_PX,
  };
  const lngLat = map.unproject([labelPx.x, labelPx.y]);
  return [lngLat.lng, lngLat.lat];
}

/** 拖曳期間快取 feature／中心，避免每幀掃描與重配 properties。 */
export function createStationLabelDragPreviewUpdater(map, stationId, dragCenter) {
  const src = map.getSource("station-labels");
  const data = src?._data;
  const feature = data?.features?.find((x) => x.properties?.station_id === stationId);
  const center = dragCenter;

  return function updatePreviewCoord(coord) {
    if (!feature?.geometry || !data) return false;
    const nextOffset = labelOffsetFromCenterPx(map, center, coord);
    const prevOffset = feature.properties?.label_offset_xy;
    if (
      Array.isArray(prevOffset) &&
      prevOffset.length >= 2 &&
      prevOffset[0] === nextOffset[0] &&
      prevOffset[1] === nextOffset[1]
    ) {
      return true;
    }
    if (!feature.properties) feature.properties = {};
    feature.properties.label_offset_xy = nextOffset;
    feature.geometry.coordinates = center;
    src.setData(data);
    return true;
  };
}

export function setStationLabelPreviewCoord(map, stationId, coord) {
  const src = map.getSource("station-labels");
  const data = src?._data;
  if (!data?.features) return false;
  const f = data.features.find((x) => x.properties?.station_id === stationId);
  if (!f?.geometry) return false;
  const center = getDisplayedStationCenter(map, stationId, f.geometry.coordinates);
  if (!f.properties) f.properties = {};
  f.properties.label_offset_xy = labelOffsetFromCenterPx(map, center, coord);
  f.geometry.coordinates = center;
  src.setData(data);
  return true;
}

export function drawLabelDragLimitCircle(map, center, radiusMeters) {
  const src = map.getSource("label-drag-limit");
  if (!src) return;
  const circle = turf.circle(center, radiusMeters / 1000, { steps: 80, units: "kilometers" });
  src.setData({
    type: "FeatureCollection",
    features: [circle],
  });
}

export function clearLabelDragLimitCircle(map) {
  const src = map.getSource("label-drag-limit");
  if (!src) return;
  src.setData({
    type: "FeatureCollection",
    features: [],
  });
}
