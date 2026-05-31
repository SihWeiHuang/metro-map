# 官方路線參考圖層

在地圖上疊一層**官方原始**路線（深灰、在彩色預設路線下方），用來對照、修正 `taipei-mrt-import-fitted` 跑位等問題。  
**網站上沒有開關**，只有開發者改程式或本機指令。

## 怎麼開啟／關閉

打開 **`src/map/referenceOverlayConfig.js`**，改這一行：

```javascript
export const MRT_REFERENCE_OVERLAY_ON = 0;  // 0 關閉、1 開啟
```

| 值 | 效果 |
|----|------|
| `0` | 關閉（預設，一般訪客看不到參考層） |
| `1` | 開啟（本機 `npm run dev` 或部署到線上後，所有人都會看到參考層） |

改完後：

- **本機**：重新整理或重跑 `npm run dev`
- **線上**：commit → push → 等 Vercel 部署完成 → 重新整理網站

### 本機暫時開啟（不必改檔）

```bash
npm run dev:reference
```

等同把開關打開，只影響這次本機開發，不會改到 `referenceOverlayConfig.js`。

## 畫面上會怎樣

- 深灰路線與車站疊在**正式彩色路線下面**
- **不會**出現在路線清單，也**不能**點選編輯
- 要改預設 fitted 仍須改 `default-data/taipei-mrt-import-fitted.json` 再部署

## 資料放哪

| 檔案 | 說明 |
|------|------|
| `default-data/taipei-mrt-import-fitted.json` | **預設路線**（網站載入；`npm run fit:mrt` 產出） |
| `data/taipei-mrt-import.json` | 官方原始匯入（`convert-mrt-shp` 產出或手動維護） |
| `data/taipei-mrt-import-temp.json` | 可手動維護的工作副本 |
| `src/default-routes/taipei-mrt-import-reference-temp.json` | 參考疊圖打包用（與原始匯入同步） |

若更新了 `data/taipei-mrt-import.json`，請同步複製到 `data/taipei-mrt-import-temp.json` 與 `src/default-routes/taipei-mrt-import-reference-temp.json`，再 build／部署。

## 相關程式（保留、不必刪）

- `default-data/` — **預設路線 JSON**（網站經 `src/map/defaultData.js` 載入）
- `src/map/referenceOverlayConfig.js` — **開關（0／1）**
- `src/map/mrtReferenceOverlay.js` — 參考疊圖資料與樣式
- `src/map/layers.js` — 搜尋 `MRT_REFERENCE` 或 `mrt-reference`
