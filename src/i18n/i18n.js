const STORAGE_KEY = "metro-map-locale";

/** @type {'zh-Hant' | 'en'} */
let locale = "zh-Hant";

const listeners = new Set();

function readInitialLocale() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "zh-Hant") return v;
  } catch (_) {}
  return "zh-Hant";
}

locale = readInitialLocale();

if (typeof document !== "undefined") {
  document.documentElement.lang = locale === "en" ? "en" : "zh-Hant";
}

const STRINGS = {
  "zh-Hant": {
    "lang.zh": "繁中",
    "lang.en": "English",
    "app.headerTitle": "捷運路線圖編輯",
    "app.headerTagline": "在地圖上繪製與管理路線、車站",
    "app.routeListAria": "路線清單",
    "app.resizeAria": "拖曳調整路線清單寬度",
    "app.modeGeneral": "一般模式",
    "app.modeAddRoute": "新增路線",
    "app.modeEditRoute": "編輯路線",
    "app.modeEditStation": "編輯車站",
    "app.modeMerge": "合併路線",
    "app.modeUngroup": "解散路線",
    "app.finish": "完成",
    "app.cancel": "取消",
    "app.submodeStation": "車站編輯",
    "app.submodeMoveLabel": "移動車站名稱",
    "app.modeIndicatorEditStation": "目前模式：編輯車站 / {sub}",
    "app.hintPrefix": "操作提示：",
    "app.controlsSectionTitle": "編輯模式",
    "app.editModeToggleAriaExpand": "展開編輯工具列",
    "app.editModeToggleAriaCollapse": "收合編輯工具列",
    "app.editModeToggleLockedTitle": "請先完成或取消目前操作",
    "app.editToolsRegionLabel": "編輯工具",
    "routeList.selectAll": "全選",
    "routeList.selected": "已選 {n}",
    "routeList.hideRoutes": "隱藏路線",
    "routeList.showRoutes": "顯示路線",
    "routeList.deleteSelected": "刪除選取",
    "routeList.hide": "隱藏",
    "routeList.show": "顯示",
    "routeList.deleteGroup": "刪除",
    "routeList.confirmDeleteMany": "確定要刪除選取的 {count} 個群組嗎？此動作無法復原。",
    "routeList.confirmDeleteGroup": "確定要刪除整個群組 {id} 嗎？此動作無法復原。",
    "routeList.groupFallback": "群組 {id}",
    "routeList.colorTitle": "更改整個群組的顏色",
    "routeList.filterLabel": "篩選",
    "routeList.columnsTitle": "顯示欄位",
    "routeList.filterAll": "全部",
    "routeList.colName": "名稱",
    "routeList.colKind": "類型",
    "routeList.colCountry": "國家",
    "routeList.colRegion": "地區",
    "routeList.colGroupId": "群組",
    "routeList.colActions": "操作",
    "routeList.kindDefault": "內建",
    "routeList.kindUser": "使用者",
    "routeList.kindBadgeTitle": "路線來源：內建（官方／免費展示）或使用者自繪",
    "routeList.emptyMeta": "—",
    "modeHint.general": "請選擇一種模式開始操作。",
    "modeHint.addRoute": "點擊地圖或路線可新增節點；拖曳節點可移動；完成後按「完成」。",
    "modeHint.editRouteSelect": "請先點選一條路線群組進入編輯。",
    "modeHint.editRouteActive": "可點擊新增/刪除/拖曳節點，完成後按「完成」儲存。",
    "modeHint.editStationMoveLabel": "移動車站名稱：拖曳字卡可調整位置（受半徑限制）。",
    "modeHint.editStationStation": "車站編輯：可拖曳車站、點路線新增車站、點車站開啟編輯視窗。",
    "modeHint.mergeFirst": "請選擇第一條路線。",
    "modeHint.mergeSecond": "請選擇第二條路線。",
    "modeHint.ungroup": "請點選要解散的群組（點群組內任一路線即可）。",
    "popup.transferAdd": "新增轉乘站",
    "popup.routeTotalStations": "總車站數：{n}",
    "popup.routesPassingHeader": "經過路線：",
    "popup.save": "儲存",
    "popup.delete": "刪除",
    "popup.confirmDeleteStation": "確定要刪除車站「{name}」嗎？",
    "routeModel.routeDefault": "路線 {id}",
    "routeModel.stationDefault": "站 {id}",
    "routeModel.alertMinStations": "每條路線至少需要 {min} 個車站。",
    "routeModel.mergeDifferent": "請選擇兩條不同的路線。",
    "routeModel.mergeNotFound": "找不到要合併的路線。",
    "routeModel.ungroupNotFound": "找不到要解散的路線。",
    "routeModel.ungroupSingle": "此群組已是單一路線，無需解散。",
  },
  en: {
    "lang.zh": "繁中",
    "lang.en": "English",
    "app.headerTitle": "Metro map editor",
    "app.headerTagline": "Draw and manage routes and stations on the map",
    "app.routeListAria": "Route list",
    "app.resizeAria": "Drag to resize the route list",
    "app.modeGeneral": "General",
    "app.modeAddRoute": "Add route",
    "app.modeEditRoute": "Edit route",
    "app.modeEditStation": "Edit station",
    "app.modeMerge": "Merge routes",
    "app.modeUngroup": "Split group",
    "app.finish": "Done",
    "app.cancel": "Cancel",
    "app.submodeStation": "Edit stations",
    "app.submodeMoveLabel": "Move labels",
    "app.modeIndicatorEditStation": "Current mode: Edit station / {sub}",
    "app.hintPrefix": "Hint: ",
    "app.controlsSectionTitle": "Modes & tools",
    "app.editModeToggleAriaExpand": "Expand editing tools",
    "app.editModeToggleAriaCollapse": "Collapse editing tools",
    "app.editModeToggleLockedTitle": "Finish or cancel the current action first",
    "app.editToolsRegionLabel": "Editing tools",
    "routeList.selectAll": "Select all",
    "routeList.selected": "{n} selected",
    "routeList.hideRoutes": "Hide routes",
    "routeList.showRoutes": "Show routes",
    "routeList.deleteSelected": "Delete selected",
    "routeList.hide": "Hide",
    "routeList.show": "Show",
    "routeList.deleteGroup": "Delete",
    "routeList.confirmDeleteMany":
      "Delete {count} selected group(s)? This cannot be undone.",
    "routeList.confirmDeleteGroup": "Delete entire group {id}? This cannot be undone.",
    "routeList.groupFallback": "Group {id}",
    "routeList.colorTitle": "Change color for the whole group",
    "routeList.filterLabel": "Filter",
    "routeList.columnsTitle": "Columns",
    "routeList.filterAll": "All",
    "routeList.colName": "Name",
    "routeList.colKind": "Type",
    "routeList.colCountry": "Country",
    "routeList.colRegion": "Region",
    "routeList.colGroupId": "Group",
    "routeList.colActions": "Actions",
    "routeList.kindDefault": "Built-in",
    "routeList.kindUser": "User",
    "routeList.kindBadgeTitle": "Route source: built-in (official / free view) or user-drawn",
    "routeList.emptyMeta": "—",
    "modeHint.general": "Choose a mode to get started.",
    "modeHint.addRoute": "Click the map or a route to add nodes; drag nodes to move. Press Done when finished.",
    "modeHint.editRouteSelect": "Click a route group on the map to edit.",
    "modeHint.editRouteActive": "Click to add/delete/drag nodes. Press Done to save.",
    "modeHint.editStationMoveLabel": "Move labels: drag the label card (within the radius limit).",
    "modeHint.editStationStation": "Edit stations: drag stations, click a route to add a station, click a station for the editor.",
    "modeHint.mergeFirst": "Select the first route.",
    "modeHint.mergeSecond": "Select the second route.",
    "modeHint.ungroup": "Click a group to split (any route in the group).",
    "popup.transferAdd": "Add transfer",
    "popup.routeTotalStations": "Stations: {n}",
    "popup.routesPassingHeader": "Lines served:",
    "popup.save": "Save",
    "popup.delete": "Delete",
    "popup.confirmDeleteStation": "Delete station “{name}”?",
    "routeModel.routeDefault": "Route {id}",
    "routeModel.stationDefault": "Station {id}",
    "routeModel.alertMinStations": "Each route needs at least {min} station(s).",
    "routeModel.mergeDifferent": "Pick two different routes.",
    "routeModel.mergeNotFound": "Could not find routes to merge.",
    "routeModel.ungroupNotFound": "Could not find the route to split.",
    "routeModel.ungroupSingle": "This group already has a single route.",
  },
};

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
export function t(key, vars = {}) {
  const table = STRINGS[locale] || STRINGS["zh-Hant"];
  let str = table[key] ?? STRINGS["zh-Hant"][key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replaceAll(`{${k}}`, String(v));
  }
  return str;
}

export function getLocale() {
  return locale;
}

/** @param {'zh-Hant' | 'en'} next */
export function setLocale(next) {
  if (next !== "en" && next !== "zh-Hant") return;
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (_) {}
  if (typeof document !== "undefined") {
    document.documentElement.lang = next === "en" ? "en" : "zh-Hant";
  }
  listeners.forEach((fn) => fn());
}

export function subscribeLocale(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
