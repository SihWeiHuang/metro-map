import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import MapView from "./components/MapView.jsx";
import RouteListPanel from "./components/RouteListPanel.jsx";
import RouteStatusDialog from "./components/RouteStatusDialog.jsx";
import {
  setMode,
  finishEditing,
  cancelMerge,
  setEditStationSubmode,
  registerEditStationSubmodeChange,
  registerModeHintChange,
} from "./map/modeBundle.js";
import { Route } from "./map/routeModel.js";
import { useI18n } from "./i18n/I18nProvider.jsx";
import { resizeMap } from "./map/mapInstance.js";
import { requestImportedMapView } from "./map/mapViewState.js";

const ROUTE_LIST_WIDTH_STORAGE_KEY = "metro-route-list-width";
const ROUTE_LIST_MIN_PX = 200;

function routeListMaxPx() {
  return Math.min(720, Math.floor(window.innerWidth * 0.55));
}

function readStoredRouteListWidth() {
  try {
    const v = localStorage.getItem(ROUTE_LIST_WIDTH_STORAGE_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) {
        return Math.min(routeListMaxPx(), Math.max(ROUTE_LIST_MIN_PX, n));
      }
    }
  } catch (_) {}
  return Math.min(320, routeListMaxPx());
}

const LOCALE_OPTIONS = [
  { id: "zh-Hant", labelKey: "lang.zh" },
  { id: "en", labelKey: "lang.en" },
];

function App() {
  const { t, locale, setLocale } = useI18n();
  const [mode, setModeState] = useState("general");
  const [editStationSubmode, setEditStationSubmodeState] = useState("station");
  const [modeHint, setModeHint] = useState(() => t("modeHint.general"));
  const [listTick, setListTick] = useState(0);
  const [routeListWidthPx, setRouteListWidthPx] = useState(readStoredRouteListWidth);
  const routeListWidthRef = useRef(routeListWidthPx);
  routeListWidthRef.current = routeListWidthPx;
  /** 未開啟時側欄內其他按鈕皆停用（僅「編輯模式」可切換） */
  const [editToolsOpen, setEditToolsOpen] = useState(false);
  const importInputRef = useRef(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [importUndoAvailable, setImportUndoAvailable] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef(null);
  const [statusDialog, setStatusDialog] = useState(null);

  const startRouteListResize = useCallback((clientX) => {
    const startX = clientX;
    const startW = routeListWidthRef.current;
    let last = startW;
    const move = (ev) => {
      if ("touches" in ev && ev.touches.length > 0) {
        ev.preventDefault();
      }
      const x = "touches" in ev && ev.touches.length > 0 ? ev.touches[0].clientX : ev.clientX;
      const maxW = routeListMaxPx();
      const next = Math.min(maxW, Math.max(ROUTE_LIST_MIN_PX, startW + (x - startX)));
      last = next;
      setRouteListWidthPx(next);
    };
    const end = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(ROUTE_LIST_WIDTH_STORAGE_KEY, String(last));
      } catch (_) {}
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
  }, []);

  useEffect(() => {
    const onWinResize = () => {
      setRouteListWidthPx((w) => {
        const maxW = routeListMaxPx();
        return Math.min(maxW, Math.max(ROUTE_LIST_MIN_PX, w));
      });
    };
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, []);

  const onModeChange = useCallback((next) => {
    setModeState(next);
    if (next !== "edit-station") {
      setEditStationSubmodeState("station");
    }
  }, []);

  const onEditStationSubmodeChange = useCallback((next) => {
    setEditStationSubmodeState(next);
  }, []);

  const bumpRouteList = () => setListTick((t) => t + 1);

  useEffect(() => {
    registerEditStationSubmodeChange(onEditStationSubmodeChange);
  }, [onEditStationSubmodeChange]);

  useEffect(() => {
    registerModeHintChange(setModeHint);
  }, []);

  useEffect(() => Route.subscribeImportUndoAvailability(setImportUndoAvailable), []);

  useEffect(() => {
    if (mode !== "general" || !editToolsOpen) {
      setFileMenuOpen(false);
    }
  }, [mode, editToolsOpen]);

  useEffect(() => {
    if (!langMenuOpen) return;
    const closeIfOutside = (e) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setLangMenuOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setLangMenuOpen(false);
    };
    document.addEventListener("mousedown", closeIfOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", closeIfOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [langMenuOpen]);

  useEffect(() => {
    setListTick((x) => x + 1);
  }, [locale]);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      resizeMap();
    });
    return () => cancelAnimationFrame(t);
  }, [routeListWidthPx]);

  const showFinish =
    mode === "add-route" ||
    mode === "edit-route-select" ||
    mode === "edit-route-active" ||
    mode === "edit-station";
  const showMergeCancel = mode === "merge" || mode === "ungroup";
  const routeListEditActions =
    mode === "edit-route-select" || mode === "edit-route-active";
  const mergeSelectMode = mode === "merge";
  const ungroupSelectMode = mode === "ungroup";
  const isEditRouteMode = mode === "edit-route-select" || mode === "edit-route-active";
  const showEditStationSubmodeButtons = mode === "edit-station";

  const toolsDisabled = !editToolsOpen;

  /** 任一模式中（未完成／取消前）不可關閉「編輯模式」開關 */
  const editModeToggleLocked = editToolsOpen && mode !== "general";

  /** 已開啟編輯工具且不在一般模式時，僅當前模式按鈕可按，其餘變灰 */
  const modeBtnDisabled = (isThisModeActive) => {
    if (!editToolsOpen) return true;
    if (mode === "general") return false;
    return !isThisModeActive;
  };

  const handleFinishEditing = () => {
    const result = finishEditing();
    if (result?.ok && result.newGroupIds?.length > 0) {
      setStatusDialog({ groupIds: result.newGroupIds, isNewRoute: true });
    }
    bumpRouteList();
  };

  const openRouteMetadataDialog = (groupId) => {
    setStatusDialog({ groupIds: [groupId], isNewRoute: false });
  };

  const closeStatusDialog = () => setStatusDialog(null);

  const toggleEditTools = () => {
    setEditToolsOpen((prev) => {
      const next = !prev;
      if (!next) {
        setMode("general");
      }
      return next;
    });
  };

  const handleExportMap = () => {
    const json = Route.exportUserStateJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = Route.getExportFileName();
    a.click();
    URL.revokeObjectURL(url);
  };

  const importErrorMessage = (code) => {
    if (code === "unsupported_format") return t("app.importErrorUnsupported");
    if (code === "missing_features") return t("app.importErrorMissing");
    if (code === "invalid_json") return t("app.importErrorInvalid");
    return t("app.importErrorGeneric");
  };

  const applyImport = (text, mode) => {
    const result = Route.importUserStateJSON(text, { mode });
    if (!result.ok) {
      alert(importErrorMessage(result.error));
      return;
    }
    setMode("general");
    setEditToolsOpen(false);
    bumpRouteList();
    const importedMapView = result.mapView;
    const successKey =
      result.mode === "replaceMatching" ? "app.importSuccessReplaceMatching" : "app.importSuccess";
    const successVars =
      result.mode === "replaceMatching"
        ? {
            replacedRoutes: result.replacedRouteCount,
            addedRoutes: result.addedRouteCount,
            stations: result.stationCount,
          }
        : {
            routes: result.routeCount,
            stations: result.stationCount,
          };
    alert(t(successKey, successVars));
    requestImportedMapView(importedMapView);
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch {
      alert(t("app.importErrorInvalid"));
      return;
    }
    if (Route.hasUserContent()) {
      const analysis = Route.analyzeImportJSON(text);
      if (!analysis.ok) {
        alert(importErrorMessage(analysis.error));
        return;
      }
      if (analysis.duplicateGroupIds.length === 0) {
        applyImport(text, "merge");
        return;
      }
      setPendingImport({ text, duplicateGroupIds: analysis.duplicateGroupIds });
      return;
    }
    applyImport(text, "merge");
  };

  const closeImportDialog = () => setPendingImport(null);

  const confirmImportWithMode = (mode) => {
    if (pendingImport == null) return;
    const { text } = pendingImport;
    setPendingImport(null);
    applyImport(text, mode);
  };

  const handleImportMapClick = () => {
    importInputRef.current?.click();
  };

  const handleUndoLastImport = () => {
    const result = Route.undoLastImport();
    if (!result.ok) return;
    setMode("general");
    setEditToolsOpen(false);
    bumpRouteList();
    const restoredMapView = result.mapView;
    alert(t("app.undoLastImportSuccess"));
    requestImportedMapView(restoredMapView);
  };

  const openFileMenu = () => {
    if (modeBtnDisabled(false)) return;
    setFileMenuOpen(true);
  };
  const closeFileMenu = () => setFileMenuOpen(false);

  const handleFileMenuExport = () => {
    closeFileMenu();
    handleExportMap();
  };

  const handleFileMenuImport = () => {
    closeFileMenu();
    handleImportMapClick();
  };

  const handleFileMenuUndo = () => {
    closeFileMenu();
    handleUndoLastImport();
  };

  return (
    <div className="app-root">
      <header className="app-site-header">
        <div className="app-site-header-inner">
          <div className="app-site-header-text">
            <h1 className="app-site-title">{t("app.headerTitle")}</h1>
            <p className="app-site-tagline">{t("app.headerTagline")}</p>
          </div>
          <div className="app-header-actions">
            <div className="app-lang-dropdown" ref={langMenuRef}>
              <button
                type="button"
                className="app-lang-dropdown-trigger"
                aria-haspopup="listbox"
                aria-expanded={langMenuOpen}
                aria-label={t("lang.ariaLabel")}
                onClick={() => setLangMenuOpen((open) => !open)}
              >
                <span>{locale === "en" ? t("lang.en") : t("lang.zh")}</span>
                <span className="app-lang-dropdown-chevron" aria-hidden="true" />
              </button>
              {langMenuOpen && (
                <ul className="app-lang-dropdown-menu" role="listbox" aria-label={t("lang.ariaLabel")}>
                  {LOCALE_OPTIONS.map((opt) => (
                    <li key={opt.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={locale === opt.id}
                        className={locale === opt.id ? "is-active" : ""}
                        onClick={() => {
                          setLocale(opt.id);
                          setLangMenuOpen(false);
                        }}
                      >
                        {t(opt.labelKey)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </header>
      <div className="app-main-layout">
        <aside
          id="route-list-container"
          className="route-list-sidebar"
          style={{ width: routeListWidthPx }}
          aria-label={t("app.routeListAria")}
        >
          <div className="route-list-sidebar-scroll">
            <RouteListPanel
              key={listTick}
              onRefresh={bumpRouteList}
              showRouteActions={routeListEditActions}
              mergeSelectMode={mergeSelectMode}
              ungroupSelectMode={ungroupSelectMode}
              onEditRouteMetadata={openRouteMetadataDialog}
            />
          </div>
          <div className={`app-controls-dock${editToolsOpen ? " app-controls-dock-open" : ""}`}>
            <button
              id="edit-mode-toggle"
              type="button"
              className={`app-edit-mode-toggle${editToolsOpen ? " active-button" : ""}`}
              disabled={editModeToggleLocked}
              onClick={toggleEditTools}
              aria-expanded={editToolsOpen}
              aria-controls="edit-tools-panel"
              title={
                editModeToggleLocked
                  ? t("app.editModeToggleLockedTitle")
                  : editToolsOpen
                    ? t("app.editModeToggleAriaCollapse")
                    : t("app.editModeToggleAriaExpand")
              }
            >
              <span className="app-edit-mode-toggle-label">{t("app.controlsSectionTitle")}</span>
              <span className="app-edit-mode-chevron" aria-hidden>
                {editToolsOpen ? "▾" : "▸"}
              </span>
            </button>
            <div
              id="edit-tools-panel"
              className={`app-controls-toolbar${editToolsOpen ? "" : " app-controls-toolbar--collapsed"}`}
              role="region"
              aria-label={t("app.editToolsRegionLabel")}
              aria-hidden={!editToolsOpen}
            >
              <div className={`button-container${toolsDisabled ? " button-container-disabled" : ""}`}>
              <div id="mode-buttons" className="mode-buttons">
                <button
                  type="button"
                  disabled={modeBtnDisabled(mode === "add-route")}
                  className={mode === "add-route" ? "active-button" : ""}
                  onClick={() => setMode("add-route")}
                >
                  {t("app.modeAddRoute")}
                </button>
                <button
                  type="button"
                  disabled={modeBtnDisabled(isEditRouteMode) || isEditRouteMode}
                  className={isEditRouteMode ? "active-button mode-button-active-locked" : ""}
                  onClick={() => setMode("edit-route-select")}
                >
                  {t("app.modeEditRoute")}
                </button>
                <button
                  type="button"
                  disabled={modeBtnDisabled(mode === "edit-station")}
                  className={mode === "edit-station" ? "active-button" : ""}
                  onClick={() => setMode("edit-station")}
                >
                  {t("app.modeEditStation")}
                </button>
                <button
                  type="button"
                  disabled={modeBtnDisabled(mode === "merge")}
                  className={mode === "merge" ? "active-button" : ""}
                  onClick={() => setMode("merge")}
                >
                  {t("app.modeMerge")}
                </button>
                <button
                  type="button"
                  disabled={modeBtnDisabled(mode === "ungroup")}
                  className={mode === "ungroup" ? "active-button" : ""}
                  onClick={() => setMode("ungroup")}
                >
                  {t("app.modeUngroup")}
                </button>
                <button
                  type="button"
                  disabled={modeBtnDisabled(false)}
                  onClick={openFileMenu}
                  title={t("app.routeFilesMenuTitle")}
                >
                  {t("app.routeFilesMenu")}
                </button>
              </div>
              {showMergeCancel && (
                <button type="button" id="mergeCancelButton" disabled={toolsDisabled} onClick={cancelMerge}>
                  {t("app.cancel")}
                </button>
              )}
              {showEditStationSubmodeButtons && (
                <div className="submode-buttons">
                  <button
                    type="button"
                    disabled={toolsDisabled}
                    className={editStationSubmode === "station" ? "active-button" : ""}
                    onClick={() => setEditStationSubmode("station")}
                  >
                    {t("app.submodeStation")}
                  </button>
                  <button
                    type="button"
                    disabled={toolsDisabled}
                    className={editStationSubmode === "move-label" ? "active-button" : ""}
                    onClick={() => setEditStationSubmode("move-label")}
                  >
                    {t("app.submodeMoveLabel")}
                  </button>
                </div>
              )}
              </div>
            </div>
          </div>
        </aside>
        <div
          className="route-list-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("app.resizeAria")}
          onMouseDown={(e) => {
            e.preventDefault();
            startRouteListResize(e.clientX);
          }}
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
            startRouteListResize(e.touches[0].clientX);
          }}
        />
        <div className="app-main-column">
          <div className="app-map-stage">
            <MapView onModeChange={onModeChange} />
            <div className="mode-hint mode-hint-map" role="status" aria-live="polite">
              {t("app.hintPrefix")}
              {modeHint}
            </div>
          </div>
          <div className="app-map-finish-slot">
            {showFinish && editToolsOpen && (
              <button type="button" id="finishModeButton" className="mode-finish-bar" onClick={handleFinishEditing}>
                {t("app.finish")}
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="app-import-input"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void handleImportFile(file);
        }}
      />
      {statusDialog != null && (
        <RouteStatusDialog
          groupIds={statusDialog.groupIds}
          isNewRoute={statusDialog.isNewRoute}
          onClose={closeStatusDialog}
          onSaved={bumpRouteList}
        />
      )}
      {fileMenuOpen && (
        <div className="app-import-dialog-backdrop" role="presentation" onClick={closeFileMenu}>
          <div
            className="app-import-dialog app-file-menu-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-menu-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="file-menu-dialog-title" className="app-import-dialog-title">
              {t("app.routeFilesDialogTitle")}
            </h2>
            <div className="app-file-menu-actions">
              <button type="button" className="app-file-menu-btn" onClick={handleFileMenuExport} title={t("app.exportRoutesTitle")}>
                {t("app.exportRoutes")}
              </button>
              <button type="button" className="app-file-menu-btn" onClick={handleFileMenuImport} title={t("app.importMapTitle")}>
                {t("app.importMap")}
              </button>
              <button
                type="button"
                className="app-file-menu-btn"
                disabled={!importUndoAvailable}
                onClick={handleFileMenuUndo}
                title={t("app.undoLastImportTitle")}
              >
                {t("app.undoLastImport")}
              </button>
            </div>
            <div className="app-import-dialog-actions">
              <button type="button" className="app-import-dialog-btn app-import-dialog-btn--cancel" onClick={closeFileMenu}>
                {t("app.importCancel")}
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingImport != null && (
        <div className="app-import-dialog-backdrop" role="presentation" onClick={closeImportDialog}>
          <div
            className="app-import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="import-dialog-title" className="app-import-dialog-title">
              {t("app.importModeTitle")}
            </h2>
            <p className="app-import-dialog-message">{t("app.importModeMessage")}</p>
            <p className="app-import-dialog-duplicates">
              {t("app.importDuplicateHint", {
                ids: pendingImport.duplicateGroupIds.join("、"),
              })}
            </p>
            <div className="app-import-dialog-options">
              <button type="button" className="app-import-option" onClick={() => confirmImportWithMode("merge")}>
                <span className="app-import-option-label">{t("app.importMergeDirect")}</span>
                <span className="app-import-option-hint">{t("app.importMergeDirectHint")}</span>
              </button>
              <button type="button" className="app-import-option" onClick={() => confirmImportWithMode("replaceMatching")}>
                <span className="app-import-option-label">{t("app.importReplaceMatching")}</span>
                <span className="app-import-option-hint">{t("app.importReplaceMatchingHint")}</span>
              </button>
            </div>
            <div className="app-import-dialog-actions">
              <button type="button" className="app-import-dialog-btn app-import-dialog-btn--cancel" onClick={closeImportDialog}>
                {t("app.importCancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
