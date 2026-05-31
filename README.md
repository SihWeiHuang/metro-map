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
| `src/map/defaultNames.js` | **唯一**處理預設路線／車站名稱。新增路線請用 `allocateDefaultRouteLabel()`，新增車站請用 `allocateDefaultStationLabel()`，顯示名稱請用 `resolveRouteDisplayNameFromProps()` / `resolveStationDisplayName()`。內部 `subroute_id` / `station_id` 與顯示編號（`user_default_route_label` / `user_default_label`）分離。 |
| `src/map/mapPopups.js` | **唯一**管理地圖 hover／提示 popup，並依模式強制規則（例如 `edit-station` 不顯示路線 hover，只顯示「新增轉乘站」）。請勿在 `modeBundle.js` 直接 `new mapboxgl.Popup()`。 |
| `src/map/modeBundle.js` | 模式切換、游標、hover 編排；popup 一律委派給 `mapPopups.js`。 |
| `src/map/routeModel.js` | 資料與商業邏輯；命名與 popup 顯示邏輯不在此重複實作。 |
| `shared/shareLimits.js` | 分享連結與全站路線數上限常數（前後端共用）。 |
| `api/share/` | 建立／讀取分享連結的 Serverless API。 |
| `src/map/layers.js` | 底圖減雜訊（`applyBasemapClutterReduction`）；細部與 Studio 分工見 **[docs/底圖樣式調整.md](docs/底圖樣式調整.md)**。 |

驗證預設命名：`npm run test:names`

### 暫用：官方路線灰色參考圖層（對齊 fitted 時）

官方路線參考圖層（深灰疊圖、僅開發者開關）：改 `src/map/referenceOverlayConfig.js` 的 `MRT_REFERENCE_OVERLAY_ON`（`0` 關、`1` 開），或本機 `npm run dev:reference`。說明見 **[docs/MRT_REFERENCE_OVERLAY.md](docs/MRT_REFERENCE_OVERLAY.md)**。
