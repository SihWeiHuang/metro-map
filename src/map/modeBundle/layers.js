import { findSubrouteBySubrouteId } from "../../data/routeQueries.js";
import { TEMP_EDIT_LINE_HIT_LAYER } from "./state.js";

export function isPrimaryMouseButton(e) {
  const btn = e?.originalEvent?.button;
  return btn === undefined || btn === 0;
}

export function queryFeaturesAtPoint(map, point, layerIds, padPx = 0) {
  if (!layerIds.length) return [];
  if (!padPx) return map.queryRenderedFeatures(point, { layers: layerIds });
  const x = point.x;
  const y = point.y;
  const pad = padPx;
  return map.queryRenderedFeatures(
    [
      [x - pad, y - pad],
      [x + pad, y + pad],
    ],
    { layers: layerIds },
  );
}

export function queryTempEditLineAtPoint(map, point) {
  const layers = map.getLayer(TEMP_EDIT_LINE_HIT_LAYER)
    ? [TEMP_EDIT_LINE_HIT_LAYER]
    : ["temp-edit-line-layer"];
  return queryFeaturesAtPoint(map, point, layers, 0);
}

export function getRouteFeature(subroute_id) {
  const f = findSubrouteBySubrouteId(subroute_id);
  return f ? { type: "Feature", geometry: f.geometry, properties: f.properties } : null;
}

export function primarySubrouteIdForStation(stationFeature) {
  const subrouteId = stationFeature?.properties?.subroute_id;
  if (subrouteId) return subrouteId;
  const transferRoutes = stationFeature?.properties?.transfer_routes;
  if (Array.isArray(transferRoutes) && transferRoutes.length > 0) return transferRoutes[0];
  return "";
}

export function subrouteIdFromStationEvent(e) {
  return primarySubrouteIdForStation(e.features?.[0]);
}
