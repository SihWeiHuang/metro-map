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
  stF.geometry.coordinates = coord;
  stationsSrc.setData(stationsData);

  const labelsSrc = map.getSource("station-labels");
  const labelsData = labelsSrc?._data;
  if (!labelsData?.features) return true;
  const lbF = labelsData.features.find((x) => x.properties?.station_id === stationId);
  if (!lbF?.geometry) return true;
  lbF.geometry.coordinates = coord;
  labelsSrc.setData(labelsData);
  return true;
}

export function setStationLabelPreviewCoord(map, stationId, coord) {
  const src = map.getSource("station-labels");
  const data = src?._data;
  if (!data?.features) return false;
  const f = data.features.find((x) => x.properties?.station_id === stationId);
  if (!f?.geometry) return false;
  const center = getDisplayedStationCenter(map, stationId, f.geometry.coordinates);
  const cpx = map.project(center);
  const tpx = map.project(coord);
  f.properties = {
    ...f.properties,
    label_offset_xy: [(tpx.x - cpx.x) / 12, (tpx.y - cpx.y) / 12],
  };
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
