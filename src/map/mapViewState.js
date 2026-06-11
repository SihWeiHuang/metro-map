import { computeBoundsFromFeatures, normalizeImportedMapView } from "./mapGeoBounds.js";
import { DEFAULT_MAP_VIEW } from "./defaultMapViewConstants.js";
import { getMap } from "./mapInstance.js";
import { store } from "../data/metroStore.js";
import {
  fitMapBounds,
  flyToMapCamera,
  getMapBearing,
  getMapCenter,
  getMapPitch,
  getMapZoom,
  jumpToMapCamera,
  mapOn,
  mapOnce,
} from "../map-runtime/mapEngine.js";

export const MAP_VIEW_STORAGE_KEY = "metro-map-view-v1";

const SAVE_DEBOUNCE_MS = 400;
const SUPPRESS_SAVE_MS = 800;

/** 匯入／跳轉路線時：較近的視野（較高 zoom、較少邊距） */
const IMPORT_MAP_PADDING = 28;
const IMPORT_MAP_MAX_ZOOM = 17;
const IMPORT_ZOOM_BOOST = 1;

let saveTimer = null;
let suppressSaveUntil = 0;
/** @type {import('./mapGeoBounds.js').ReturnType<normalizeImportedMapView> | null | undefined} undefined = 無待處理 */
let pendingImportMapViewApply = undefined;

/** @returns {[[number, number], [number, number]] | null} */
export function computeRoutesBounds() {
  return computeBoundsFromFeatures(store.subroutesFC.features, store.stationsFC.features);
}

export function loadSavedMapView() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.center) || data.center.length < 2) return null;
    const [lng, lat] = data.center;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return {
      center: [lng, lat],
      zoom: typeof data.zoom === "number" ? data.zoom : DEFAULT_MAP_VIEW.zoom,
      bearing: typeof data.bearing === "number" ? data.bearing : 0,
      pitch: typeof data.pitch === "number" ? data.pitch : 0,
    };
  } catch {
    return null;
  }
}

export function saveMapView(map) {
  if (!map || typeof localStorage === "undefined") return;
  try {
    const center = getMapCenter(map);
    const payload = {
      center: [center.lng, center.lat],
      zoom: getMapZoom(map),
      bearing: getMapBearing(map),
      pitch: getMapPitch(map),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

function markSuppressSave() {
  suppressSaveUntil = Date.now() + SUPPRESS_SAVE_MS;
}

function scheduleSaveMapView(map) {
  if (!map) return;
  if (Date.now() < suppressSaveUntil) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (Date.now() < suppressSaveUntil) return;
    saveMapView(map);
  }, SAVE_DEBOUNCE_MS);
}

function applyCamera(map, view) {
  if (!map || !view) return;
  markSuppressSave();
  jumpToMapCamera(map, {
    center: view.center,
    zoom: view.zoom,
    bearing: view.bearing ?? 0,
    pitch: view.pitch ?? 0,
  });
}

/**
 * 依目前地圖上的路線／站點調整視野。
 * @returns {boolean} 是否成功對準
 */
export function fitMapToRoutes(map, { animate = true, saveAfter = false, padding = 56, maxZoom = 15 } = {}) {
  if (!map) return false;
  const bounds = computeRoutesBounds();
  if (!bounds) return false;

  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const degenerate = minLng === maxLng && minLat === maxLat;

  markSuppressSave();

  if (degenerate) {
    jumpToMapCamera(map, {
      center: [minLng, minLat],
      zoom: Math.min(maxZoom, 14),
    });
  } else {
    fitMapBounds(map, bounds, {
      padding,
      maxZoom,
      duration: animate ? 800 : 0,
    });
  }

  if (saveAfter) {
    mapOnce(map, "moveend", () => {
      if (Date.now() >= suppressSaveUntil - 50) saveMapView(map);
    });
  }

  return true;
}

/** 建立地圖時使用的初始鏡頭（已儲存視野或預設定值） */
export function getInitialMapCamera() {
  return loadSavedMapView() ?? { ...DEFAULT_MAP_VIEW };
}

/**
 * 地圖 load 後：若無儲存視野，套用預設定值（台北車站＋涵蓋雙北捷運預設路網之縮放）。
 */
export function applyMapCameraAfterLoad(map) {
  if (!map) return;
  if (loadSavedMapView()) return;
  applyCamera(map, DEFAULT_MAP_VIEW);
}

/**
 * @returns {boolean} 是否已套用
 */
function flushPendingImportMapView() {
  if (pendingImportMapViewApply === undefined) return false;

  const map = getMap();
  if (!map) return false;

  const pending = pendingImportMapViewApply;
  pendingImportMapViewApply = undefined;

  if (pending) {
    return applyImportedMapView(map, pending, { animate: false, saveAfter: true });
  }
  return fitMapToRoutes(map, {
    animate: false,
    saveAfter: true,
    padding: IMPORT_MAP_PADDING,
    maxZoom: IMPORT_MAP_MAX_ZOOM,
  });
}

let importMapViewRetryTimer = null;

function stopImportMapViewRetry() {
  if (importMapViewRetryTimer != null) {
    clearInterval(importMapViewRetryTimer);
    importMapViewRetryTimer = null;
  }
}

/**
 * 匯入／還原匯入完成後排程移動視野（可重複呼叫，以最後一次為準）。
 * @param {{ center: [number, number], zoom: number, bounds?: [[number, number], [number, number]] } | null | undefined} mapView
 */
export function scheduleImportMapView(mapView) {
  pendingImportMapViewApply = mapView ?? null;
  stopImportMapViewRetry();

  const tryFlush = () => {
    if (flushPendingImportMapView()) {
      stopImportMapViewRetry();
      return true;
    }
    return false;
  };

  if (tryFlush()) return;

  let attempts = 0;
  importMapViewRetryTimer = setInterval(() => {
    attempts += 1;
    if (tryFlush() || attempts >= 40) {
      stopImportMapViewRetry();
    }
  }, 50);
}

/**
 * 套用匯出檔內的 mapView；無 mapView 時改為依路線對準。
 * @param {{ center: [number, number], zoom: number, bounds?: [[number, number], [number, number]] } | null | undefined} mapView
 */
export function requestImportedMapView(mapView) {
  scheduleImportMapView(mapView);
}

/** 清除已儲存視野並飛回內建預設鏡頭（雙北）。 */
export function requestDefaultMapView({ animate = true } = {}) {
  pendingImportMapViewApply = undefined;
  stopImportMapViewRetry();
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(MAP_VIEW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  const map = getMap();
  if (!map) return false;
  markSuppressSave();
  const view = { ...DEFAULT_MAP_VIEW };
  if (animate) {
    flyToMapCamera(map, {
      center: view.center,
      zoom: view.zoom,
      bearing: view.bearing ?? 0,
      pitch: view.pitch ?? 0,
      duration: 800,
    });
  } else {
    jumpToMapCamera(map, {
      center: view.center,
      zoom: view.zoom,
      bearing: view.bearing ?? 0,
      pitch: view.pitch ?? 0,
    });
  }
  if (animate) {
    mapOnce(map, "moveend", () => {
      if (Date.now() >= suppressSaveUntil - 50) saveMapView(map);
    });
  }
  return true;
}

export function applyImportedMapView(map, mapView, { animate = false, saveAfter = true } = {}) {
  const view = normalizeImportedMapView(mapView);
  if (!map || !view) return false;

  const zoom = Math.min(IMPORT_MAP_MAX_ZOOM, view.zoom + IMPORT_ZOOM_BOOST);

  markSuppressSave();

  if (view.bounds) {
    const [[minLng, minLat], [maxLng, maxLat]] = view.bounds;
    const degenerate = minLng === maxLng && minLat === maxLat;
    if (degenerate) {
      jumpToMapCamera(map, { center: view.center, zoom, bearing: 0, pitch: 0 });
    } else {
      fitMapBounds(map, view.bounds, {
        padding: IMPORT_MAP_PADDING,
        maxZoom: IMPORT_MAP_MAX_ZOOM,
        duration: animate ? 800 : 0,
      });
    }
  } else {
    jumpToMapCamera(map, {
      center: view.center,
      zoom,
      bearing: 0,
      pitch: 0,
    });
  }

  if (saveAfter) {
    mapOnce(map, "moveend", () => {
      if (Date.now() >= suppressSaveUntil - 50) saveMapView(map);
    });
  }
  return true;
}

export function consumePendingMapFit(map) {
  if (!map) return;
  if (pendingImportMapViewApply !== undefined) {
    flushPendingImportMapView();
  }
}

export function bindMapViewPersistence(map) {
  if (map.__metroViewPersistenceBound) return;
  map.__metroViewPersistenceBound = true;
  mapOn(map, "moveend", () => scheduleSaveMapView(map));
}

export function snapshotMapView(map) {
  if (!map) return null;
  const center = getMapCenter(map);
  return {
    center: [center.lng, center.lat],
    zoom: getMapZoom(map),
    bearing: getMapBearing(map),
    pitch: getMapPitch(map),
  };
}
