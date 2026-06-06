/**
 * 地圖右側廣告區（僅佔位，尚未接 AdSense 等第三方）
 *
 * 開關方式（擇一即可）：
 *   1. 改下面 AD_SIDEBAR_ON：0 = 關閉，1 = 開啟 → 存檔後重新 build／部署
 *   2. 環境變數 VITE_AD_SIDEBAR_ON=0 或 1（若已設定，優先於本檔常數）
 *
 * 側欄寬度 160px，預留標準 160×600 Wide Skyscraper（摩天大樓）廣告位。
 * AdSense：VITE_ADSENSE_CLIENT（及可選 VITE_ADSENSE_SLOT）— 見 .env.example
 */

export const AD_SIDEBAR_ON = 1;

/** @type {160} 與 .ad-sidebar 寬度一致，供地圖 resize 使用 */
export const AD_SIDEBAR_WIDTH_PX = 160;

/** @type {600} 標準 160×600 廣告槽最小高度 */
export const AD_SIDEBAR_SLOT_MIN_HEIGHT_PX = 600;

/**
 * @returns {boolean}
 */
export function isAdSidebarEnabled() {
  const env = import.meta.env.VITE_AD_SIDEBAR_ON;
  if (env === "1") return true;
  if (env === "0") return false;
  return AD_SIDEBAR_ON === 1;
}
