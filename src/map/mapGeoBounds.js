function isValidLngLat(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return false;
  const [lng, lat] = coord;
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function addCoord(coords, lngs, lats) {
  if (!isValidLngLat(coords)) return;
  lngs.push(coords[0]);
  lats.push(coords[1]);
}

function extendFromGeometry(geometry, lngs, lats) {
  if (!geometry) return;
  const { type, coordinates } = geometry;
  if (type === "Point") {
    addCoord(coordinates, lngs, lats);
  } else if (type === "LineString") {
    coordinates.forEach((c) => addCoord(c, lngs, lats));
  } else if (type === "MultiLineString") {
    coordinates.forEach((line) => line.forEach((c) => addCoord(c, lngs, lats)));
  }
}

/**
 * @param {import('geojson').Feature[]} subrouteFeatures
 * @param {import('geojson').Feature[]} [stationFeatures]
 * @returns {[[number, number], [number, number]] | null}
 */
export function computeBoundsFromFeatures(subrouteFeatures = [], stationFeatures = []) {
  const lngs = [];
  const lats = [];

  for (const f of subrouteFeatures) {
    if (f?.properties?.subroute_id === "__temp_preview__") continue;
    extendFromGeometry(f?.geometry, lngs, lats);
  }
  for (const f of stationFeatures) {
    if (f?.properties?.subroute_id === "__temp_preview__") continue;
    extendFromGeometry(f?.geometry, lngs, lats);
  }

  if (!lngs.length) return null;

  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function estimateZoomForBounds(bounds) {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const latSpan = Math.max(0.0001, maxLat - minLat);
  const lngSpan = Math.max(0.0001, maxLng - minLng);
  const latMid = (minLat + maxLat) / 2;
  const lngSpanAdj = lngSpan * Math.cos((latMid * Math.PI) / 180);
  const span = Math.max(latSpan, lngSpanAdj);
  const zoom = Math.log2(360 / span) + 0.35;
  return Math.max(4, Math.min(17, zoom));
}

/**
 * @param {import('geojson').Feature[]} subrouteFeatures
 * @param {import('geojson').Feature[]} [stationFeatures]
 * @returns {{ center: [number, number], zoom: number } | null}
 */
export function computeMapViewFromFeatures(subrouteFeatures = [], stationFeatures = []) {
  const bounds = computeBoundsFromFeatures(subrouteFeatures, stationFeatures);
  if (!bounds) return null;

  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const center = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  const degenerate = minLng === maxLng && minLat === maxLat;
  const zoom = degenerate ? 15 : estimateZoomForBounds(bounds);

  return { center, zoom, bounds };
}

function normalizeBounds(raw) {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [sw, ne] = raw;
  if (!Array.isArray(sw) || !Array.isArray(ne) || sw.length < 2 || ne.length < 2) return null;
  const [minLng, minLat] = sw;
  const [maxLng, maxLat] = ne;
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * @param {unknown} raw
 * @returns {{ center: [number, number], zoom: number } | null}
 */
export function normalizeImportedMapView(raw) {
  if (!raw || typeof raw !== "object") {
    if (Array.isArray(raw) && raw.length >= 2) {
      const [lng, lat] = raw;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return { center: [lng, lat], zoom: 14 };
      }
    }
    return null;
  }

  const centerRaw = raw.center ?? raw.mapCenter;
  if (!Array.isArray(centerRaw) || centerRaw.length < 2) return null;
  const [lng, lat] = centerRaw;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const bounds = normalizeBounds(raw.bounds);

  return {
    center: [lng, lat],
    zoom: typeof raw.zoom === "number" && Number.isFinite(raw.zoom) ? raw.zoom : 14,
    ...(bounds ? { bounds } : {}),
  };
}
