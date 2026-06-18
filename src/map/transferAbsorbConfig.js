/** 轉乘站建立時，吸收一般車站的半徑（公尺）。 */
export const TRANSFER_ABSORB_METERS = 60;

/** 游標與黃色吸附點距離 ≤ 此值（公尺）時視為「吸附」。 */
export const TRANSFER_SNAP_HOVER_METERS = 22;

/** 點擊路線時，與交叉吸附點距離 ≤ 此值（公尺）則改為新增轉乘站。 */
export const TRANSFER_SNAP_CLICK_METERS = 30;

/** 車站 mousedown 後移動距離 ≤ 此值（像素）視為點擊，否則為拖曳。 */
export const STATION_DRAG_CLICK_THRESHOLD_PX = 5;

export const ABSORB_ZONE_LAYER = {
  lineColor: "#f59e0b",
  lineWidth: 1.5,
  lineOpacity: 0.45,
  fillOpacity: 0.08,
  hoverLineWidth: 2.5,
  hoverLineOpacity: 0.8,
  hoverFillOpacity: 0.18,
};
