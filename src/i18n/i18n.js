const STORAGE_KEY = "metro-map-locale";

/** @type {'zh-Hant' | 'en'} */
let locale = "zh-Hant";

const listeners = new Set();

function readInitialLocale() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "zh-Hant") return v;
  } catch {
    // Ignore storage access failures and use the default locale.
  }
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
    "lang.ariaLabel": "語言",
    "app.headerTitle": "Metro Multiverse",
    "app.headerTagline": "在地圖上編輯你的捷運多重宇宙",
    "site.navAria": "網站資訊",
    "site.nav.legal": "條款與隱私",
    "site.nav.about": "關於",
    "site.nav.support": "贊助",
    "site.nav.contact": "聯絡我們",
    "site.backToMap": "返回地圖",
    "site.openSponsor": "前往贊助頁面",
    "app.routeListAria": "路線清單",
    "app.resizeAria": "拖曳調整路線清單寬度",
    "app.modeGeneral": "一般模式",
    "app.modeAddRoute": "新增路線",
    "app.modeEditRoute": "編輯路線",
    "app.modeEditStation": "編輯車站",
    "app.modeMerge": "合併路線",
    "app.modeSplitLine": "解散路線",
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
    "app.routeFilesMenu": "路線檔案",
    "app.routeFilesMenuTitle": "匯入、匯出或還原路線",
    "app.routeFilesDialogTitle": "路線檔案",
    "app.exportRoutes": "匯出路線",
    "app.exportRoutesTitle": "下載路線資料檔（JSON），可分享給他人匯入",
    "app.importMap": "匯入路線",
    "app.importMapTitle": "從 JSON 檔案匯入路線與車站",
    "app.undoLastImport": "還原匯入",
    "app.undoLastImportTitle": "還原至最近一次匯入前的路線",
    "app.undoLastImportSuccess": "已還原至匯入前的路線。",
    "app.importModeTitle": "匯入路線",
    "app.importModeMessage": "匯入檔案中的路線名稱與現有路線重複，請選擇匯入方式：",
    "app.importDuplicateHint": "重複的路線：{names}",
    "app.importMergeDirect": "直接加入",
    "app.importMergeDirectHint": "保留現有路線；重複的路線會自動重新命名",
    "app.importReplaceMatching": "取代重複",
    "app.importReplaceMatchingHint": "以檔案覆蓋同名路線的資料，其餘路線保留",
    "app.importCancel": "關閉",
    "app.importSuccess": "已匯入 {subRoutes} 條子路線、{stations} 個車站。",
    "app.importSuccessReplaceMatching":
      "已取代 {replacedSubRoutes} 條子路線、新增 {addedSubRoutes} 條子路線，共 {stations} 個車站。",
    "app.importErrorInvalid": "無法讀取檔案，請確認為本專案匯出的 JSON。",
    "app.importErrorUnsupported": "不支援的檔案格式。",
    "app.importErrorMissing": "檔案缺少路線或車站資料。",
    "app.importErrorGeneric": "匯入失敗，請稍後再試。",
    "routeList.selectAll": "全選",
    "routeList.selected": "已選 {n}",
    "routeList.hideRoutes": "隱藏路線",
    "routeList.showRoutes": "顯示路線",
    "routeList.deleteSelected": "刪除選取",
    "routeList.exportSelected": "匯出選取",
    "routeList.exportSelectedTitle": "下載已勾選路線的 JSON 檔（可分享或匯入）",
    "routeList.exportNoUserRoutes": "選取的路線中沒有可匯出的使用者子路線（預設路線無法匯出）。",
    "routeList.mergePickHint": "點選兩條路線以合併（亦可於地圖上點選子路線）",
    "routeList.mergePickProgress": "已選 {n} / 2",
    "routeList.mergePickOrder": "第 {n} 條",
    "routeList.hide": "隱藏",
    "routeList.show": "顯示",
    "routeList.deleteRoute": "刪除",
    "routeList.confirmDeleteMany": "確定要刪除選取的 {count} 條路線嗎？此動作無法復原。",
    "routeList.confirmDeleteLine": "確定要刪除整條路線 {id} 嗎？此動作無法復原。",
    "routeList.lineFallback": "路線 {id}",
    "routeList.colorTitle": "更改整條路線的顏色",
    "routeList.filterLabel": "篩選",
    "routeList.columnsTitle": "顯示欄位",
    "routeList.filterAll": "全部",
    "routeList.colName": "名稱",
    "routeList.colKind": "類型",
    "routeList.colCountry": "國家",
    "routeList.colRegion": "地區",
    "routeList.colRouteId": "路線 ID",
    "routeList.colActions": "操作",
    "routeList.kindDefault": "預設",
    "routeList.kindUser": "使用者",
    "routeList.routeInfo": "資訊",
    "routeList.routeInfoTitle": "編輯路線狀態（營運中、規劃中等）",
    "routeList.statusBadgeTitle": "路線營運狀態",
    "routeStatus.dialogTitle": "路線中繼資料",
    "routeStatus.dialogTitleNew": "設定新路線狀態",
    "routeStatus.dialogHint": "請選擇此路線的狀態：",
    "routeStatus.doNotShowForNewRoutes": "新增路線後不再自動顯示此視窗",
    "routeStatus.operating": "營運中",
    "routeStatus.planning": "規劃中",
    "routeStatus.construction": "施工中",
    "routeStatus.custom": "自創",
    "routeStatus.save": "確定",
    "routeList.kindBadgeTitle": "路線來源：預設（官方／免費展示）或使用者自繪",
    "routeList.emptyMeta": "—",
    "modeHint.general": "請選擇操作模式。",
    "modeHint.routeNodeEdit": "點擊新增節點，拖曳節點移動。",
    "modeHint.editRouteSelect": "請點選路線以進入編輯。",
    "modeHint.editStationMoveLabel": "拖曳字卡以調整站名位置。",
    "modeHint.editStationStation": "拖曳車站以移動位置；點選子路線以新增車站；於路線交叉處黃色標記可新增轉乘站。",
    "modeHint.mergeFirst": "請選擇第一條路線。",
    "modeHint.mergeSecond": "請選擇第二條路線。",
    "modeHint.splitLine": "請點選要解散之路線。",
    "popup.transferAdd": "新增轉乘站",
    "popup.routeTotalStations": "總車站數：{n}",
    "popup.routesPassingHeader": "經過路線：",
    "popup.save": "儲存",
    "popup.delete": "刪除",
    "popup.confirmDeleteStation": "確定要刪除車站「{name}」嗎？",
    "routeModel.subRouteDefault": "子路線 {id}",
    "routeModel.lineDefault": "路線{id}",
    "routeModel.stationDefault": "站{id}",
    "routeModel.alertMinStations": "每條子路線至少需要 {min} 個車站。",
    "routeModel.mergeDifferent": "請選擇兩條不同的路線。",
    "routeModel.mergeNotFound": "找不到要合併的路線。",
    "routeModel.mergeSuccess": "路線合併成功。",
    "routeModel.splitLineNotFound": "找不到要解散的子路線。",
    "routeModel.splitLineSingle": "此路線僅有一條子路線，無法解散。",
    "routeModel.splitLineSuccess": "解散路線成功。",
    "routeList.splitLinePickHint": "點選要解散的路線（亦可於地圖上點選）",
  },
  en: {
    "lang.zh": "繁中",
    "lang.en": "English",
    "lang.ariaLabel": "Language",
    "app.headerTitle": "Metro Multiverse",
    "app.headerTagline": "Edit your metro multiverse on the map",
    "site.navAria": "Site information",
    "site.nav.legal": "Legal & privacy",
    "site.nav.about": "About",
    "site.nav.support": "Support",
    "site.nav.contact": "Contact",
    "site.backToMap": "Back to map",
    "site.openSponsor": "Open sponsor page",
    "app.routeListAria": "Line list",
    "app.resizeAria": "Drag to resize the line list",
    "app.modeGeneral": "General",
    "app.modeAddRoute": "Add line",
    "app.modeEditRoute": "Edit line",
    "app.modeEditStation": "Edit station",
    "app.modeMerge": "Merge lines",
    "app.modeSplitLine": "Split line",
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
    "app.routeFilesMenu": "Line files",
    "app.routeFilesMenuTitle": "Import, export, or undo import",
    "app.routeFilesDialogTitle": "Line files",
    "app.exportRoutes": "Export lines",
    "app.exportRoutesTitle": "Download line data (JSON) to share with others",
    "app.importMap": "Import lines",
    "app.importMapTitle": "Import lines and stations from a JSON file",
    "app.undoLastImport": "Undo import",
    "app.undoLastImportTitle": "Restore lines from before the last import",
    "app.undoLastImportSuccess": "Restored lines from before the last import.",
    "app.importModeTitle": "Import lines",
    "app.importModeMessage": "Some line names in the file already exist. Choose how to import:",
    "app.importDuplicateHint": "Duplicate lines: {names}",
    "app.importMergeDirect": "Add directly",
    "app.importMergeDirectHint": "Keep existing routes; duplicates are renamed automatically",
    "app.importReplaceMatching": "Replace duplicates",
    "app.importReplaceMatchingHint": "Overwrite routes with the same name; keep all others",
    "app.importCancel": "Close",
    "app.importSuccess": "Imported {subRoutes} sub-route(s) and {stations} station(s).",
    "app.importSuccessReplaceMatching":
      "Replaced {replacedSubRoutes} sub-route(s), added {addedSubRoutes} sub-route(s), {stations} station(s) total.",
    "app.importErrorInvalid": "Could not read the file. Use a JSON file exported from this app.",
    "app.importErrorUnsupported": "Unsupported file format.",
    "app.importErrorMissing": "The file is missing line or station data.",
    "app.importErrorGeneric": "Import failed. Please try again.",
    "routeList.selectAll": "Select all",
    "routeList.selected": "{n} selected",
    "routeList.hideRoutes": "Hide lines",
    "routeList.showRoutes": "Show lines",
    "routeList.deleteSelected": "Delete selected",
    "routeList.exportSelected": "Export selected",
    "routeList.exportSelectedTitle": "Download JSON for checked lines (share or import)",
    "routeList.exportNoUserRoutes": "No user-drawn sub-routes in the selection (default lines cannot be exported).",
    "routeList.mergePickHint": "Click two lines to merge (or pick a sub-route on the map)",
    "routeList.mergePickProgress": "{n} / 2 selected",
    "routeList.mergePickOrder": "#{n}",
    "routeList.hide": "Hide",
    "routeList.show": "Show",
    "routeList.deleteRoute": "Delete",
    "routeList.confirmDeleteMany": "Delete {count} selected line(s)? This cannot be undone.",
    "routeList.confirmDeleteLine": "Delete entire line {id}? This cannot be undone.",
    "routeList.lineFallback": "Line {id}",
    "routeList.colorTitle": "Change color for the whole line",
    "routeList.filterLabel": "Filter",
    "routeList.columnsTitle": "Columns",
    "routeList.filterAll": "All",
    "routeList.colName": "Name",
    "routeList.colKind": "Type",
    "routeList.colCountry": "Country",
    "routeList.colRegion": "Region",
    "routeList.colRouteId": "Route ID",
    "routeList.colActions": "Actions",
    "routeList.kindDefault": "Default",
    "routeList.kindUser": "User",
    "routeList.routeInfo": "Info",
    "routeList.routeInfoTitle": "Edit line status (operating, planning, etc.)",
    "routeList.statusBadgeTitle": "Line operational status",
    "routeStatus.dialogTitle": "Line metadata",
    "routeStatus.dialogTitleNew": "Set status for new line",
    "routeStatus.dialogHint": "Choose a status for this line:",
    "routeStatus.doNotShowForNewRoutes": "Do not show this automatically after adding a new line",
    "routeStatus.operating": "Operating",
    "routeStatus.planning": "Planning",
    "routeStatus.construction": "Building",
    "routeStatus.custom": "Custom",
    "routeStatus.save": "Save",
    "routeList.kindBadgeTitle": "Line source: default (official / free view) or user-drawn",
    "routeList.emptyMeta": "—",
    "modeHint.general": "Please select an operation mode.",
    "modeHint.routeNodeEdit": "Click to add nodes; drag nodes to move.",
    "modeHint.editRouteSelect": "Please click a line to begin editing.",
    "modeHint.editStationMoveLabel": "Drag label cards to adjust station name positions.",
    "modeHint.editStationStation":
      "Drag stations to reposition; click a sub-route to add a station; use yellow markers at line crossings to add transfer stations.",
    "modeHint.mergeFirst": "Please select the first line.",
    "modeHint.mergeSecond": "Please select the second line.",
    "modeHint.splitLine": "Please click the line to split.",
    "popup.transferAdd": "Add transfer",
    "popup.routeTotalStations": "Stations: {n}",
    "popup.routesPassingHeader": "Lines served:",
    "popup.save": "Save",
    "popup.delete": "Delete",
    "popup.confirmDeleteStation": "Delete station “{name}”?",
    "routeModel.subRouteDefault": "Sub-route {id}",
    "routeModel.lineDefault": "Line {id}",
    "routeModel.stationDefault": "Station {id}",
    "routeModel.alertMinStations": "Each sub-route needs at least {min} station(s).",
    "routeModel.mergeDifferent": "Pick two different lines.",
    "routeModel.mergeNotFound": "Could not find lines to merge.",
    "routeModel.mergeSuccess": "Lines merged successfully.",
    "routeModel.splitLineNotFound": "Could not find the sub-route to split.",
    "routeModel.splitLineSingle": "This line has only one sub-route and cannot be split.",
    "routeModel.splitLineSuccess": "Line split successfully.",
    "routeList.splitLinePickHint": "Click a line to split (or pick on the map)",
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
  } catch {
    // Locale still updates in memory when storage is unavailable.
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = next === "en" ? "en" : "zh-Hant";
  }
  listeners.forEach((fn) => fn());
}

export function subscribeLocale(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
