# Metro Map

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
git add -A && git commit -m "你的提交說明" && git push
```

If this branch has no upstream yet, use:

```bash
git add -A && git commit -m "你的提交說明" && git push -u origin HEAD
```

## Deploy to Vercel (GitHub Auto Deploy)

- This project reads `VITE_MAPBOX_TOKEN` from environment variables.
- In Vercel Project Settings -> Environment Variables, add:
  - Name: `VITE_MAPBOX_TOKEN`
  - Value: your Mapbox public token
  - Environments: `Production`, `Preview`, and `Development` (recommended)

Without this variable, the map will not load correctly.

## 核心模組（避免重複 bug 的約定）

| 模組 | 職責 |
|------|------|
| `src/map/defaultNames.js` | **唯一**處理預設路線／車站名稱。新增路線請用 `allocateDefaultLineLabel()`，新增車站請用 `allocateDefaultStationLabel()`，顯示名稱請用 `resolveLineDisplayNameFromProps()` / `resolveStationDisplayName()`。內部 `route_id` / `station_id` 與顯示編號（`user_default_line_label` / `user_default_label`）分離。 |
| `src/map/mapPopups.js` | **唯一**管理地圖 hover／提示 popup，並依模式強制規則（例如 `edit-station` 不顯示路線 hover，只顯示「新增轉乘站」）。請勿在 `modeBundle.js` 直接 `new mapboxgl.Popup()`。 |
| `src/map/modeBundle.js` | 模式切換、游標、hover 編排；popup 一律委派給 `mapPopups.js`。 |
| `src/map/routeModel.js` | 資料與商業邏輯；命名與 popup 顯示邏輯不在此重複實作。 |

驗證預設命名：`npm run test:names`
