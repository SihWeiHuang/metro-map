import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import MapView from "./components/MapView.jsx";
import RouteListPanel from "./components/RouteListPanel.jsx";
import {
  setMode,
  finishEditing,
  cancelMerge,
  setEditStationSubmode,
  registerEditStationSubmodeChange,
  registerModeHintChange,
} from "./map/modeBundle.js";
import { useI18n } from "./i18n/I18nProvider.jsx";
import { resizeMap } from "./map/mapInstance.js";

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

  const toggleEditTools = () => {
    setEditToolsOpen((prev) => {
      const next = !prev;
      if (!next) {
        setMode("general");
      }
      return next;
    });
  };

  return (
    <div className="app-root">
      <header className="app-site-header">
        <div className="app-site-header-inner">
          <div className="app-site-header-text">
            <h1 className="app-site-title">{t("app.headerTitle")}</h1>
            <p className="app-site-tagline">{t("app.headerTagline")}</p>
          </div>
          <div className="app-lang-switch" role="group" aria-label="Language">
            <button
              type="button"
              className={locale === "zh-Hant" ? "active" : ""}
              onClick={() => setLocale("zh-Hant")}
            >
              {t("lang.zh")}
            </button>
            <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>
              {t("lang.en")}
            </button>
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
              <button type="button" id="finishModeButton" className="mode-finish-bar" onClick={finishEditing}>
                {t("app.finish")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
