/**
 * 路線清單導覽與地圖視野聯動。
 *
 * 優先順序：
 * 1. 該城市有路線 → fitBounds（含站點）
 * 2. geoCatalog 有預設 mapView → flyTo / jumpTo
 * 3. 皆無 → 不移動地圖（之後可在 BUILTIN_GEO_CATALOG 手動加入城市 mapView）
 */

import { canonicalizeCountryId, canonicalizeRegion, getCatalogMapView } from "./geoCatalog.js";
import { computeBoundsFromFeatures } from "./mapGeoBounds.js";
import { getMap } from "./mapInstance.js";
import { saveMapView } from "./mapViewState.js";
import { store } from "../data/metroStore.js";
import {
  fitMapBounds,
  flyToMapCamera,
  jumpToMapCamera,
  mapOnce,
} from "../map-runtime/mapEngine.js";

const GEO_CITY_MAP_PADDING = 48;
const GEO_CITY_MAP_MAX_ZOOM = 15;
const GEO_CITY_FLY_DURATION_MS = 800;

let suppressSaveUntil = 0;
let pendingGeoCityApply = null;
let geoCityRetryTimer = null;

function markSuppressSave() {
  suppressSaveUntil = Date.now() + 800;
}

function stopGeoCityRetry() {
  if (geoCityRetryTimer != null) {
    clearInterval(geoCityRetryTimer);
    geoCityRetryTimer = null;
  }
}

function collectCityRouteFeatures(countryId, regionId) {
  const cid = canonicalizeCountryId(countryId);
  const rid = canonicalizeRegion(regionId);
  const routeIds = new Set();

  for (const f of store.subroutesFC.features) {
    const p = f.properties;
    if (!p) continue;
    if (canonicalizeCountryId(p.country) === cid && canonicalizeRegion(p.region) === rid) {
      routeIds.add(p.route_id);
    }
  }

  const subroutes = store.subroutesFC.features.filter((f) => routeIds.has(f.properties?.route_id));
  const subrouteIds = new Set(subroutes.map((f) => f.properties?.subroute_id).filter(Boolean));
  const stations = store.stationsFC.features.filter((f) => subrouteIds.has(f.properties?.subroute_id));

  return { subroutes, stations };
}

/**
 * @param {import('../map-runtime/mapTypes.js').MapLike | null | undefined} map
 * @param {unknown} countryId
 * @param {unknown} regionId
 * @param {{ animate?: boolean, saveAfter?: boolean }} [options]
 * @returns {{ ok: boolean, mode?: 'routes' | 'catalog', reason?: string }}
 */
export function applyGeoCityMapView(map, countryId, regionId, { animate = true, saveAfter = true } = {}) {
  if (!map) return { ok: false, reason: "no_map" };

  const { subroutes, stations } = collectCityRouteFeatures(countryId, regionId);
  const bounds = computeBoundsFromFeatures(subroutes, stations);

  markSuppressSave();

  if (bounds) {
    const [[minLng, minLat], [maxLng, maxLat]] = bounds;
    const degenerate = minLng === maxLng && minLat === maxLat;

    if (degenerate) {
      jumpToMapCamera(map, {
        center: [minLng, minLat],
        zoom: Math.min(GEO_CITY_MAP_MAX_ZOOM, 14),
      });
    } else {
      fitMapBounds(map, bounds, {
        padding: GEO_CITY_MAP_PADDING,
        maxZoom: GEO_CITY_MAP_MAX_ZOOM,
        duration: animate ? GEO_CITY_FLY_DURATION_MS : 0,
      });
    }

    if (saveAfter && animate) {
      mapOnce(map, "moveend", () => {
        if (Date.now() >= suppressSaveUntil - 50) saveMapView(map);
      });
    }

    return { ok: true, mode: "routes" };
  }

  const catalogView = getCatalogMapView(countryId, regionId);
  if (!catalogView) {
    return { ok: false, reason: "no_catalog" };
  }

  const camera = {
    center: catalogView.center,
    zoom: catalogView.zoom,
    bearing: catalogView.bearing ?? 0,
    pitch: catalogView.pitch ?? 0,
  };

  if (animate) {
    flyToMapCamera(map, { ...camera, duration: GEO_CITY_FLY_DURATION_MS });
  } else {
    jumpToMapCamera(map, camera);
  }

  if (saveAfter && animate) {
    mapOnce(map, "moveend", () => {
      if (Date.now() >= suppressSaveUntil - 50) saveMapView(map);
    });
  }

  return { ok: true, mode: "catalog" };
}

function flushPendingGeoCityMapView() {
  if (!pendingGeoCityApply) return false;

  const map = getMap();
  if (!map) return false;

  const { countryId, regionId, options } = pendingGeoCityApply;
  pendingGeoCityApply = null;
  const result = applyGeoCityMapView(map, countryId, regionId, options);
  return result.ok;
}

/**
 * 進入某城市之路線層時排程移動視野（地圖尚未 ready 時會重試）。
 * @param {unknown} countryId
 * @param {unknown} regionId
 * @param {{ animate?: boolean, saveAfter?: boolean }} [options]
 */
export function scheduleGeoCityMapView(countryId, regionId, options = {}) {
  pendingGeoCityApply = {
    countryId: canonicalizeCountryId(countryId),
    regionId: canonicalizeRegion(regionId),
    options,
  };
  stopGeoCityRetry();

  const tryFlush = () => {
    if (flushPendingGeoCityMapView()) {
      stopGeoCityRetry();
      return true;
    }
    return false;
  };

  if (tryFlush()) return;

  let attempts = 0;
  geoCityRetryTimer = setInterval(() => {
    attempts += 1;
    if (tryFlush() || attempts >= 40) {
      stopGeoCityRetry();
    }
  }, 50);
}
