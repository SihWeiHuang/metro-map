# Metro Multiverse

捷運多重宇宙 — 在地圖上編輯路線與車站的示意圖工具（非官方）。

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Create local env file

```bash
cp .env.example .env
```

3. Fill in your Mapbox token in `.env`

```env
VITE_MAPBOX_TOKEN=your_mapbox_public_token
```

4. Run development server

```bash
npm run dev
```

5. Commit and push changes to GitHub

Stage all changes, create a commit, and push to the remote in one command. Replace the message with a short description of your changes:

```bash
git add -A && git commit -m "簡短英文commit説明" && git push
```

If this branch has no upstream yet, use:

```bash
git add -A && git commit -m "簡短英文commit説明" && git push -u origin HEAD
```

## Deploy to Vercel (GitHub Auto Deploy)

- This project reads `VITE_MAPBOX_TOKEN` from environment variables.
- In Vercel Project Settings -> Environment Variables, add:
  - Name: `VITE_MAPBOX_TOKEN`
  - Value: your Mapbox public token
  - Environments: `Production`, `Preview`, and `Development` (recommended)

Without this variable, the map will not load correctly.

### Share links (short URLs)

Route sharing uses Vercel serverless APIs and **Redis (KV)**. Connect a Redis integration in the Vercel project, then redeploy. Setup steps (Traditional Chinese): **[docs/分享連結設定.md](docs/分享連結設定.md)**.

Optional site pages (About, Legal, Support):

```env
VITE_SITE_CONTACT_EMAIL=you@example.com
VITE_SPONSOR_URL=https://ko-fi.com/yourpage
```

## 上線安全（Mapbox 帳單防護）

正式站：https://metro-multiverse.vercel.app  

GitHub 請勿上傳 `.env`（專案已用 `.gitignore` 排除）。Mapbox **URL 限制**、**每月花費上限**、Vercel 環境變數確認等步驟見：

**[docs/上線安全設定.md](docs/上線安全設定.md)** · Vercel/GitHub 改名：[docs/部署與重新命名.md](docs/部署與重新命名.md)

## 核心模組（避免重複 bug 的約定）

| 模組 | 職責 |
|------|------|
| `src/data/metroStore.js` | **權威** in-memory route store（GeoJSON + metadata；含 `layers.default` / `layers.user` 分區）。 |
| `src/data/storeLayers.js` | default / user 圖層合併與拆分（`syncMergedFromLayers`、`splitMergedIntoLayers`）。 |
| `src/data/routeQueries.js` | 唯讀 route 查詢（子路線、車站、計數）。 |
| `src/data/routeConstants.js` | 匯入格式、route_kind、persist key 等常數。 |
| `src/data/defaultDataLoader.js` | 內建 default-data **lazy** 載入（Vite 動態 chunk，bootstrap 時並行合併）。 |
| `src/data/defaultDataMerge.js` | 多檔 default-data JSON 合併與 ID 前綴邏輯（browser / Node 共用）。 |
| `src/map-runtime/displayModel.js` | 衍生顯示幾何（平滑、snap）與 dirty tracking。 |
| `src/map-runtime/mapRenderer.js` | **唯一** Mapbox GeoJSON source / visibility filter 寫入者。 |
| `src/map-runtime/visibilityFilters.js` | 隱藏路線 filter 建構；catalog / hidden 未變時跳過 `setFilter`。 |
| `src/map-runtime/mapAdapter.js` | 地圖引擎抽象（Mapbox 實作；MapLibre stub 預留）。 |
| `src/metro/metroDomain.js` | UI 事件邊界、React hooks、persist adapter 匯出。 |
| `src/metro/metroBootstrap.js` | 啟動時一次性載入內建／持久化路線（由 `main.jsx` 呼叫，不在 `routeModel` 副作用載入）。 |
| `src/metro/routeCrudService.js` | 路線 CRUD、編輯 session、車站／轉乘站、顏色與隱藏。 |
| `src/metro/routeImportService.js` | 匯入／匯出／復原／重設。 |
| `src/metro/routeShareService.js` | 分享連結 session。 |
| `src/metro/routeRenderCommands.js` | 向 `mapRenderer` 委派 GeoJSON refresh 與 visibility。 |
| `src/map/modeController.js` | modeBundle 對外 facade（模式切換、事件註冊）。 |
| `src/map/routeModel.js` | Route 命令 facade（組合上述 service；對外 API 不變）。 |
| `src/map/routeTransferSnap.js` | 轉乘站 snap 幾何與 hover 輔助（自 facade 拆出）。 |
| `src/map/defaultData.js` | `default-data/*.json` chunk 目錄（`import.meta.glob` lazy，不 eager 打包進主 bundle）。 |
| `src/map/defaultNames.js` | **唯一**處理預設路線／車站名稱。新增路線請用 `allocateDefaultRouteLabel()`，新增車站請用 `allocateDefaultStationLabel()`，顯示名稱請用 `resolveRouteDisplayNameFromProps()` / `resolveStationDisplayName()`。內部 `subroute_id` / `station_id` 與顯示編號（`user_default_route_label` / `user_default_label`）分離。 |
| `src/map/mapPopups.js` | **唯一**管理地圖 hover／提示 popup，並依模式強制規則（例如 `edit-station` 不顯示路線 hover，只顯示「新增轉乘站」）。請勿在 `modeBundle.js` 直接 `new mapboxgl.Popup()`。 |
| `src/map/modeBundle.js` | 地圖模式 facade（re-export 子模組；對外 import 路徑不變）。 |
| `src/map/modeBundle/state.js` | 互動狀態 `M`、`Modes`、編輯子模式。 |
| `src/map/modeBundle/hover.js` | hover 編排與 browse／編輯提示 popup。 |
| `src/map/modeBundle/drag.js` | 車站／標籤／暫時節點拖曳。 |
| `src/map/modeBundle/control.js` | `setMode`、完成／取消、合併／拆線。 |
| `src/map/modeBundle/handlers.js` | 各模式 click／down handler（general、add-route、edit-station 等）。 |
| `src/map/modeBundle/events.js` | Mapbox 事件註冊與 pointer rAF 節流。 |
| `src/metro/metroEvents.js` | 型別化事件匯流排（取代 `register*` callback）。 |
| `src/metro/useMetro*.js` | React hooks：`useMetroStoreRevision`、`useMetroMapMode`、`useMetroMapInteraction`、`useMetroMergePick`、`useMetroShareView`。 |
| `src/app/useRouteListWidth.js` / `useShareBootstrap.js` / `useAppImportActions.js` | App 殼層 hooks（側欄寬度、分享 bootstrap、匯入流程）。 |
| `src/components/AppEditToolsPanel.jsx` 等 | App 拆分出的 UI 子元件（編輯工具列、完成列、檔案選單、匯入衝突對話框）。 |
| `shared/shareLimits.js` | 分享連結與全站路線數上限常數（前後端共用）。 |
| `api/share/` | 建立／讀取分享連結的 Serverless API。 |
| `src/map/layers.js` | 底圖減雜訊（`applyBasemapClutterReduction`）；細部與 Studio 分工見 **[docs/底圖樣式調整.md](docs/底圖樣式調整.md)**。 |

驗證預設命名：`npm run test:names`

### 預設路線資料（`default-data/`）

將符合 `metro-multiverse` 匯出格式的 `.json` 放入 **`default-data/`** 即可作為內建預設路線，**不必**在程式裡指定檔名。多個檔案會依檔名排序合併（第二個檔起會為路線／車站 ID 加上檔名前綴，避免 r1、s1 重複）。

`npm run fit:mrt` 仍會輸出至 `default-data/taipei-mrt-import-fitted.json`（可改名或與其他 JSON 並存）。

原始匯入與參考疊圖仍分別放在 `data/`、`src/default-routes/`（見 [docs/MRT_REFERENCE_OVERLAY.md](docs/MRT_REFERENCE_OVERLAY.md)）。

將網路取得的車站 GeoJSON 轉為網站匯入格式：

```bash
npm run convert:geojson
# 或指定路徑：node scripts/geojson-to-metro-import.mjs path/in.geojson "route data/out.json"
```

預設讀取 `data/northern-taiwan.geojson`，輸出 `route data/northern-taiwan-import.json`（`metro-multiverse` 格式，可於網站「匯入」使用）。

### 暫用：官方路線灰色參考圖層（對齊 fitted 時）

官方路線參考圖層（深灰疊圖、僅開發者開關）：改 `src/map/referenceOverlayConfig.js` 的 `MRT_REFERENCE_OVERLAY_ON`（`0` 關、`1` 開），或本機 `npm run dev:reference`。說明見 **[docs/MRT_REFERENCE_OVERLAY.md](docs/MRT_REFERENCE_OVERLAY.md)**。
