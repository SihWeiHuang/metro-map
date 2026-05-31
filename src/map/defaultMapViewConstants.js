/**
 * 網站預設地圖視野（固定常數，非即時 fitBounds）。
 *
 * 中心：台北車站 WGS84（121.51722, 25.04778），來源 Wikipedia「臺北車站」。
 * 縮放：依 `src/default-routes/taipei-mrt-import-fitted.json` 雙北捷運預設路網外框，
 *       以台北車站為中心、用與 `estimateZoomForBounds` 相同公式反推（約 12% 邊距）→ zoom ≈ 10.25。
 */

/** @type {[number, number]} 台北車站 [lng, lat] */
export const TAIPEI_MAIN_STATION_CENTER = [121.51722, 25.04778];

/** 涵蓋上述預設路網外框之縮放級別（Mapbox zoom） */
export const DEFAULT_MAP_ZOOM = 11.5;

/** @type {{ center: [number, number], zoom: number, bearing: number, pitch: number }} */
export const DEFAULT_MAP_VIEW = {
  center: TAIPEI_MAIN_STATION_CENTER,
  zoom: DEFAULT_MAP_ZOOM,
  bearing: 0,
  pitch: 0,
};
