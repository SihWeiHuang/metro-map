# 暫用：官方路線灰色參考圖層

對齊 `taipei-mrt-import-fitted` 時，在地圖上疊一層**官方原始**幾何（`taipei-mrt-import.json`），方便肉眼比對跑位。此功能僅供本機／短期開發，**不要**部署到正式站。

## 啟用

在 `.env` 加入（或執行下方指令）：

```env
VITE_MRT_REFERENCE_OVERLAY=true
```

```bash
npm run dev:reference
```

重新整理頁面後，會看到**深灰近黑**的路線與車站（比正式圖層略粗、略大）疊在**彩色正式路線下方**；不會出現在路線清單，也無法點選編輯。

## 資料檔

| 路徑 | 用途 |
|------|------|
| `data/taipei-mrt-import-temp.json` | 工作用副本（可手動更新） |
| `src/default-routes/taipei-mrt-import-reference-temp.json` | Vite 打包進瀏覽器的副本 |

若更新了 `data/taipei-mrt-import.json`，請同步複製到上述兩個 temp 檔。

## 完成後完整移除

1. `.env` 刪除 `VITE_MRT_REFERENCE_OVERLAY`
2. `package.json` 刪除 `dev:reference` script
3. `.env.example` 刪除相關註解
4. 刪除 `src/map/mrtReferenceOverlay.js`
5. 刪除 `data/taipei-mrt-import-temp.json` 與 `src/default-routes/taipei-mrt-import-reference-temp.json`
6. 刪除本文件 `docs/TEMP_MRT_REFERENCE_OVERLAY.md`
7. 還原 `src/map/layers.js` 中所有 `mrt-reference` / `mrtReferenceOverlay` 相關程式（搜尋 `MRT_REFERENCE` 或 `mrt-reference`，含 `mrt-reference-stations`）
