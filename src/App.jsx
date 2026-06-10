import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./App.css";
import MapView from "./components/MapView.jsx";
import RouteListNavigator from "./components/RouteListNavigator.jsx";
import RouteStatusDialog from "./components/RouteStatusDialog.jsx";
import {
  setMode,
  finishEditing,
  exitEditRouteSelectMode,
  cancelMerge,
  cancelRouteEditing,
  setEditStationSubmode,
  registerEditStationSubmodeChange,
  registerModeHintChange,
  registerRouteListInvalidation,
} from "./map/modeBundle.js";
import { Route } from "./map/routeModel.js";
import { useI18n } from "./i18n/I18nProvider.jsx";
import { resizeMap } from "./map/mapInstance.js";
import { requestImportedMapView } from "./map/mapViewState.js";
import { clearSiteLocalStorage } from "./site/siteLocalStorage.js";
import SiteHeaderNav from "./components/SiteHeaderNav.jsx";
import SiteInfoPage from "./components/SiteInfoPage.jsx";
import ShareLinkDialog from "./components/ShareLinkDialog.jsx";
import ShareViewBanner from "./components/ShareViewBanner.jsx";
import AdSidebar from "./components/AdSidebar.jsx";
import AdSenseLoader from "./components/AdSenseLoader.jsx";
import { parseSitePageFromHash, sitePageHash } from "./site/siteRoutes.js";
import { isAdSidebarEnabled } from "./site/adSidebarConfig.js";
import { isAdsenseConfigured } from "./site/adsenseConfig.js";
import { parseShareIdFromPathname } from "./share/parseSharePath.js";
import { fetchShareById } from "./share/shareApi.js";
import { installViewportSync } from "./site/viewportSync.js";

const ROUTE_LIST_WIDTH_STORAGE_KEY = "metro-route-list-width";
const AUTO_SHOW_NEW_ROUTE_STATUS_KEY = "metro-auto-show-new-route-status";
const ROUTE_LIST_MIN_PX = 200;
const adSidebarEnabled = isAdSidebarEnabled();

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

function readAutoShowNewRouteStatus() {
  try {
    return localStorage.getItem(AUTO_SHOW_NEW_ROUTE_STATUS_KEY) !== "false";
  } catch {
    return true;
  }
}

const LOCALE_OPTIONS = [
  { id: "zh-Hant", labelKey: "lang.zh" },
  { id: "en", labelKey: "lang.en" },
];

const DEFAULT_DOCUMENT_TITLE = "Metro Multiverse";

function App() {
  const { t, locale, setLocale } = useI18n();
  const [mode, setModeState] = useState("general");
  const [editStationSubmode, setEditStationSubmodeState] = useState("crud");
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
  const [langMenuStyle, setLangMenuStyle] = useState(null);
  const langMenuRef = useRef(null);
  const siteHeaderRef = useRef(null);
  const [statusDialog, setStatusDialog] = useState(null);
  const [routeListGeoFocus, setRouteListGeoFocus] = useState(null);
  const [autoShowNewRouteStatus, setAutoShowNewRouteStatus] = useState(readAutoShowNewRouteStatus);
  const [sitePage, setSitePage] = useState(() =>
    typeof window !== "undefined" ? parseSitePageFromHash(window.location.hash) : null
  );
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareViewTick, setShareViewTick] = useState(0);
  const [shareBootstrap, setShareBootstrap] = useState(() => {
    if (typeof window === "undefined") return { phase: "idle", id: null, error: "" };
    const id = parseShareIdFromPathname(window.location.pathname);
    return id ? { phase: "loading", id, error: "" } : { phase: "idle", id: null, error: "" };
  });
  const [shareActionBusy, setShareActionBusy] = useState(false);

  useEffect(() => {
    const onHashChange = () => setSitePage(parseSitePageFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (sitePage) setLangMenuOpen(false);
  }, [sitePage]);

  const updateLangMenuPosition = useCallback(() => {
    const trigger = langMenuRef.current?.querySelector(".app-lang-dropdown-trigger");
    if (!trigger) {
      setLangMenuStyle(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    setLangMenuStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      minWidth: Math.max(rect.width, 160),
      zIndex: 10000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!langMenuOpen) {
      setLangMenuStyle(null);
      return;
    }
    updateLangMenuPosition();
    window.addEventListener("resize", updateLangMenuPosition);
    return () => window.removeEventListener("resize", updateLangMenuPosition);
  }, [langMenuOpen, updateLangMenuPosition, sitePage, locale]);

  useLayoutEffect(() => {
    const headerEl = siteHeaderRef.current;
    if (!headerEl) return;
    const syncHeaderHeight = () => {
      document.documentElement.style.setProperty("--app-header-height", `${headerEl.offsetHeight}px`);
    };
    syncHeaderHeight();
    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(headerEl);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--app-header-height");
    };
  }, []);

  const navigateSitePage = useCallback((pageId) => {
    setLangMenuOpen(false);
    window.location.hash = sitePageHash(pageId);
    setSitePage(pageId);
  }, []);

  const closeSitePage = useCallback(() => {
    const base = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", base);
    setSitePage(null);
  }, []);

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
      setEditStationSubmodeState("crud");
    }
  }, []);

  const onEditStationSubmodeChange = useCallback((next) => {
    setEditStationSubmodeState(next);
  }, []);

  const bumpRouteList = () => setListTick((t) => t + 1);

  const handleRouteMetadataSaved = (payload) => {
    bumpRouteList();
    if (payload?.country != null && payload?.region != null) {
      setRouteListGeoFocus({
        country: payload.country,
        region: payload.region,
        seq: Date.now(),
      });
    }
  };

  useEffect(() => {
    registerEditStationSubmodeChange(onEditStationSubmodeChange);
  }, [onEditStationSubmodeChange]);

  useEffect(() => {
    registerModeHintChange(setModeHint);
  }, []);

  useEffect(() => {
    registerRouteListInvalidation(() => {
      requestAnimationFrame(() => bumpRouteList());
    });
  }, []);

  useEffect(() => Route.subscribeImportUndoAvailability(setImportUndoAvailable), []);

  const bumpShareView = () => setShareViewTick((n) => n + 1);

  useEffect(() => {
    if (shareBootstrap.phase !== "loading" || !shareBootstrap.id) return;
    let cancelled = false;
    (async () => {
      const fetched = await fetchShareById(shareBootstrap.id);
      if (cancelled) return;
      if (!fetched.ok) {
        setShareBootstrap({ phase: "error", id: shareBootstrap.id, error: fetched.error });
        return;
      }
      const opened = Route.openShareView(fetched.payload, { expiresAt: fetched.expiresAt });
      if (!opened.ok) {
        setShareBootstrap({ phase: "error", id: shareBootstrap.id, error: opened.error || "import_failed" });
        return;
      }
      setShareBootstrap({ phase: "ready", id: shareBootstrap.id, error: "" });
      setEditToolsOpen(false);
      setMode("general");
      bumpRouteList();
      bumpShareView();
      requestImportedMapView(opened.mapView);
    })();
    return () => {
      cancelled = true;
    };
  }, [shareBootstrap.phase, shareBootstrap.id]);

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
    cancelRouteEditing();
    setMode("general");
  }, [locale]);

  useEffect(() => {
    if (shareBootstrap.phase === "loading") {
      document.title = t("share.documentTitleLoading");
      return () => {
        document.title = DEFAULT_DOCUMENT_TITLE;
      };
    }
    if (Route.isShareViewActive()) {
      document.title = t("share.documentTitle");
      return () => {
        document.title = DEFAULT_DOCUMENT_TITLE;
      };
    }
    document.title = DEFAULT_DOCUMENT_TITLE;
  }, [shareViewTick, shareBootstrap.phase, locale]);

  useEffect(() => {
    const id = requestAnimationFrame(() => resizeMap());
    return () => cancelAnimationFrame(id);
  }, [routeListWidthPx, editToolsOpen, adSidebarEnabled]);

  useEffect(() => {
    const schedule = () => requestAnimationFrame(() => resizeMap());
    schedule();
    window.addEventListener("resize", schedule);
    const cleanupViewportSync = installViewportSync(schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      cleanupViewportSync();
    };
  }, []);

  const showFinish =
    mode === "add-route" ||
    mode === "edit-route-select" ||
    mode === "edit-route-active" ||
    mode === "edit-station";
  const showMergeCancel = mode === "merge" || mode === "split-line";
  const isEditingRouteActive = mode === "edit-route-active";
  const isEditRouteSelect = mode === "edit-route-select";
  const showAddRouteCommitActions = mode === "add-route";
  const showEditRouteSelectEndAction = isEditRouteSelect;
  const showEditRouteActiveCommitActions = isEditingRouteActive;
  const routeListEditActions = isEditRouteSelect || isEditingRouteActive;
  const mergeSelectMode = mode === "merge";
  const splitLineSelectMode = mode === "split-line";
  const isEditRouteMode = mode === "edit-route-select" || mode === "edit-route-active";
  const showEditStationSubmodeButtons = mode === "edit-station";

  const shareViewActive = Route.isShareViewActive();
  void shareViewTick;

  useEffect(() => {
    if (shareViewActive) {
      setEditToolsOpen(false);
      setMode("general");
    }
  }, [shareViewActive]);

  const toolsDisabled = !editToolsOpen || shareViewActive;

  /** 任一模式中（未完成／取消前）不可關閉「編輯模式」開關 */
  const editModeToggleLocked = editToolsOpen && mode !== "general";

  /** 已開啟編輯工具且不在一般模式時，僅當前模式按鈕可按，其餘變灰 */
  const modeBtnDisabled = (isThisModeActive) => {
    if (!editToolsOpen) return true;
    if (mode === "general") return false;
    return !isThisModeActive;
  };

  const handleFinishEditing = async () => {
    const result = await finishEditing();
    if (result?.ok && result.newRouteIds?.length > 0 && autoShowNewRouteStatus) {
      setStatusDialog({ routeIds: result.newRouteIds, isNewRoute: true });
    }
    requestAnimationFrame(() => bumpRouteList());
  };

  const handleCancelRouteEditing = () => {
    cancelRouteEditing();
    requestAnimationFrame(() => bumpRouteList());
  };

  const handleExitEditRouteSelect = () => {
    exitEditRouteSelectMode();
    requestAnimationFrame(() => bumpRouteList());
  };

  const activeEditRouteId = isEditingRouteActive ? Route.getActiveEditRouteId() : null;

  const handleDeleteActiveRouteOnMap = () => {
    const routeId = Route.getActiveEditRouteId();
    if (!routeId) return;
    const routeEntry = Route.getRouteList().find((g) => g.route_id === routeId);
    const routeName = routeEntry?.subroutes[0]?.name || routeId;
    if (!window.confirm(t("routeList.confirmDeleteLine", { name: routeName }))) return;
    cancelRouteEditing();
    Route.deleteRoute(routeId);
    requestAnimationFrame(() => bumpRouteList());
  };

  const openRouteMetadataDialog = (routeId) => {
    setStatusDialog({ routeIds: [routeId], isNewRoute: false });
  };

  const closeStatusDialog = () => setStatusDialog(null);

  const updateAutoShowNewRouteStatus = (next) => {
    setAutoShowNewRouteStatus(next);
    try {
      localStorage.setItem(AUTO_SHOW_NEW_ROUTE_STATUS_KEY, String(next));
    } catch {
      // Keep the in-memory setting even if localStorage is unavailable.
    }
  };

  const toggleEditTools = () => {
    if (shareViewActive) return;
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

  const importErrorMessage = (code, result) => {
    if (code === "route_limit_reached" && result?.limit != null) {
      return t("routeModel.routeLimitReached", { limit: result.limit, current: result.current });
    }
    if (code === "unsupported_format") return t("app.importErrorUnsupported");
    if (code === "missing_features") return t("app.importErrorMissing");
    if (code === "invalid_json") return t("app.importErrorInvalid");
    return t("app.importErrorGeneric");
  };

  const tryStartAddRoute = () => {
    const check = Route.assertCanAddUserRoutes(1);
    if (!check.ok) {
      alert(t("routeModel.routeLimitReached", { limit: check.limit, current: check.current }));
      return;
    }
    setMode("add-route");
  };

  const applyImport = (text, mode) => {
    const result = Route.importUserStateJSON(text, { mode });
    if (!result.ok) {
      alert(importErrorMessage(result.error, result));
      return;
    }
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
      if (analysis.duplicateRouteIds.length === 0) {
        applyImport(text, "merge");
        return;
      }
      setPendingImport({
        text,
        duplicateRouteLabels: analysis.duplicateRouteLabels,
      });
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
    bumpRouteList();
    const restoredMapView = result.mapView;
    alert(t("app.undoLastImportSuccess"));
    requestImportedMapView(restoredMapView);
  };

  const shareLoadErrorMessage = (code) => {
    if (code === "not_found") return t("share.loadNotFound");
    if (code === "kv_not_configured") return t("share.errorNotConfigured");
    if (code === "network_error") return t("share.errorNetwork");
    if (code === "unsupported_format" || code === "missing_features" || code === "invalid_json") {
      return importErrorMessage(code);
    }
    return t("share.loadErrorGeneric");
  };

  const handleExitShareView = () => {
    setShareActionBusy(true);
    const result = Route.exitShareView();
    setShareActionBusy(false);
    if (!result.ok) return;
    setShareBootstrap({ phase: "idle", id: null, error: "" });
    bumpRouteList();
    bumpShareView();
  };

  const handleAdoptShareView = async () => {
    setShareActionBusy(true);
    const result = Route.adoptShareToMyMap();
    setShareActionBusy(false);
    if (!result.ok) {
      if (result.error) alert(importErrorMessage(result.error, result));
      return;
    }
    setShareBootstrap({ phase: "idle", id: null, error: "" });
    bumpRouteList();
    bumpShareView();
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
    requestImportedMapView(result.mapView);
  };

  const openFileMenu = () => {
    if (shareViewActive) {
      setFileMenuOpen(true);
      return;
    }
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

  const handleFileMenuShare = () => {
    closeFileMenu();
    setShareDialogOpen(true);
  };

  const dismissSharePathIfPresent = () => {
    if (typeof window === "undefined") return;
    if (!parseShareIdFromPathname(window.location.pathname)) return;
    window.history.replaceState(null, "", "/");
    setShareBootstrap({ phase: "idle", id: null, error: "" });
  };

  const handleFileMenuReset = () => {
    if (!window.confirm(t("app.resetToDefaultConfirm"))) return;
    closeFileMenu();
    Route.resetToDefaultState();
    clearSiteLocalStorage();
    dismissSharePathIfPresent();
    window.location.reload();
  };

  const shareExpiresAt = Route.getShareViewExpiresAt();

  return (
    <div className={`app-root${shareViewActive ? " app-root--share-view" : ""}`}>
      {isAdsenseConfigured() ? <AdSenseLoader /> : null}
      <header className="app-site-header" ref={siteHeaderRef}>
        <div className="app-site-header-inner">
          <div className="app-site-header-brand">
            <div className="app-site-header-brand-inner">
              <button
                type="button"
                className="app-site-logo-btn"
                onClick={closeSitePage}
                aria-label={t("app.headerTitle")}
              >
                <img
                  src="/site-logo.png?v=3"
                  alt=""
                  className="app-site-header-logo"
                  width={44}
                  height={44}
                  decoding="async"
                />
              </button>
              <div className="app-site-header-brand-text">
                <h1 className="app-site-title">
                  <button type="button" className="app-site-title-btn" onClick={closeSitePage}>
                    {shareViewActive || shareBootstrap.phase === "loading"
                      ? t("share.headerTitle")
                      : t("app.headerTitle")}
                  </button>
                </h1>
                <p className="app-site-tagline">{t("app.headerTagline")}</p>
              </div>
            </div>
          </div>
          <div className="app-header-actions">
            <SiteHeaderNav
              activePage={sitePage}
              onNavigate={navigateSitePage}
              onHome={closeSitePage}
            />
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
              {langMenuOpen && langMenuStyle && (
                <ul
                  className="app-lang-dropdown-menu app-lang-dropdown-menu--fixed"
                  style={langMenuStyle}
                  role="listbox"
                  aria-label={t("lang.ariaLabel")}
                >
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
      {sitePage && <SiteInfoPage pageId={sitePage} onClose={closeSitePage} adGutter={adSidebarEnabled} />}
      {shareBootstrap.phase === "loading" ? (
        <div className="app-share-loading" role="status" aria-live="polite">
          {t("share.loading")}
        </div>
      ) : null}
      {shareBootstrap.phase === "error" ? (
        <div className="app-share-load-error" role="alert">
          <p>{shareLoadErrorMessage(shareBootstrap.error)}</p>
          <button
            type="button"
            className="app-share-view-btn"
            onClick={() => {
              window.history.replaceState(null, "", window.location.pathname);
              setShareBootstrap({ phase: "idle", id: null, error: "" });
            }}
          >
            {t("share.dismissLoadError")}
          </button>
        </div>
      ) : null}
      <div className="app-content-wrapper app-main-layout">
        <aside
          id="route-list-container"
          className="app-side-panel route-list-sidebar"
          style={{ width: routeListWidthPx }}
          aria-label={t("app.routeListAria")}
        >
          <RouteListNavigator
            onRefresh={bumpRouteList}
            listRevision={listTick}
            geoFocus={routeListGeoFocus}
            onGeoFocusHandled={() => setRouteListGeoFocus(null)}
            showRouteActions={routeListEditActions}
            mergeSelectMode={mergeSelectMode}
            splitLineSelectMode={splitLineSelectMode}
            onEditRouteMetadata={openRouteMetadataDialog}
          />
          {shareViewActive ? (
            <div className="app-share-sidebar-note" role="note">
              <span className="app-share-sidebar-note-badge">{t("share.viewModeBadge")}</span>
              <p>{t("share.sidebarNote")}</p>
            </div>
          ) : (
          <div className={`app-side-panel-footer app-controls-dock${editToolsOpen ? " app-controls-dock-open" : ""}`}>
            <div className="app-mode-tools">
            <div className="app-edit-mode-toggle-row">
              <button
                id="edit-mode-toggle"
                type="button"
                className={`app-edit-mode-toggle${editToolsOpen ? " active-button" : ""}`}
                disabled={editModeToggleLocked || shareViewActive}
                onClick={toggleEditTools}
                aria-expanded={editToolsOpen}
                aria-controls="edit-tools-panel"
                title={
                  shareViewActive
                    ? t("share.editDisabledTitle")
                    : editModeToggleLocked
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
            </div>
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
                  onClick={tryStartAddRoute}
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
                  disabled={modeBtnDisabled(mode === "split-line")}
                  className={mode === "split-line" ? "active-button" : ""}
                  onClick={() => setMode("split-line")}
                >
                  {t("app.modeSplitLine")}
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
                <button
                  type="button"
                  id="mergeCancelButton"
                  className="mode-cancel-bar"
                  disabled={toolsDisabled}
                  onClick={cancelMerge}
                >
                  {t("app.cancel")}
                </button>
              )}
              {showEditStationSubmodeButtons && (
                <div
                  className="edit-station-submode-panel"
                  role="group"
                  aria-label={t("app.modeEditStation")}
                >
                  <div className="edit-station-submode-panel__grid">
                    <button
                      type="button"
                      disabled={toolsDisabled}
                      className={`edit-station-submode-btn${editStationSubmode === "crud" ? " is-active" : ""}`}
                      onClick={() => setEditStationSubmode("crud")}
                    >
                      {t("app.submodeCrud")}
                    </button>
                    <button
                      type="button"
                      disabled={toolsDisabled}
                      className={`edit-station-submode-btn${editStationSubmode === "move-station" ? " is-active" : ""}`}
                      onClick={() => setEditStationSubmode("move-station")}
                    >
                      {t("app.submodeMoveStation")}
                    </button>
                    <button
                      type="button"
                      disabled={toolsDisabled}
                      className={`edit-station-submode-btn${editStationSubmode === "move-label" ? " is-active" : ""}`}
                      onClick={() => setEditStationSubmode("move-label")}
                    >
                      {t("app.submodeMoveLabel")}
                    </button>
                    <button
                      type="button"
                      disabled={toolsDisabled}
                      className={`edit-station-submode-btn${editStationSubmode === "add-transfer" ? " is-active" : ""}`}
                      onClick={() => setEditStationSubmode("add-transfer")}
                    >
                      {t("app.submodeAddTransfer")}
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>
            </div>
          </div>
          )}
        </aside>
        <div
          className="route-list-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("app.resizeAria")}
          title={t("app.resizeAria")}
          onMouseDown={(e) => {
            e.preventDefault();
            startRouteListResize(e.clientX);
          }}
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
            startRouteListResize(e.touches[0].clientX);
          }}
        >
          <div className="route-list-resize-grip" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className={`app-main-column${adSidebarEnabled ? " app-main-column--with-ad" : ""}`}>
          <div className="app-map-stage">
            <MapView onModeChange={onModeChange} />
            {shareViewActive ? (
              <ShareViewBanner
                expiresAt={shareExpiresAt}
                busy={shareActionBusy}
                onAdopt={handleAdoptShareView}
                onExit={handleExitShareView}
              />
            ) : null}
            {editToolsOpen && (
              <div className="mode-hint mode-hint-map" role="status" aria-live="polite">
                {t("app.hintPrefix")}
                {modeHint}
              </div>
            )}
            {showFinish && editToolsOpen && (
              <div
                className={`app-map-finish-slot${
                  showEditRouteActiveCommitActions && activeEditRouteId && !shareViewActive
                    ? " app-map-finish-slot--triple"
                    : showEditRouteActiveCommitActions || showAddRouteCommitActions
                      ? " app-map-finish-slot--pair"
                      : ""
                }`}
              >
                {showEditRouteActiveCommitActions ? (
                  <>
                    <button
                      type="button"
                      id="cancelRouteEditButton"
                      className="mode-cancel-bar"
                      onClick={handleCancelRouteEditing}
                    >
                      {t("app.cancelRouteEdit")}
                    </button>
                    {activeEditRouteId && !shareViewActive ? (
                      <button
                        type="button"
                        id="deleteRouteOnMapButton"
                        className="mode-delete-route-bar"
                        title={t("app.deleteRouteOnMapTitle")}
                        onClick={handleDeleteActiveRouteOnMap}
                      >
                        {t("app.deleteRouteOnMap")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      id="finishRouteEditButton"
                      className="mode-finish-bar"
                      onClick={handleFinishEditing}
                    >
                      {t("app.finishRouteEdit")}
                    </button>
                  </>
                ) : showEditRouteSelectEndAction ? (
                  <button
                    type="button"
                    id="endEditRouteButton"
                    className="mode-finish-bar"
                    onClick={handleExitEditRouteSelect}
                  >
                    {t("app.endEditRoute")}
                  </button>
                ) : showAddRouteCommitActions ? (
                  <>
                    <button
                      type="button"
                      id="cancelModeButton"
                      className="mode-cancel-bar"
                      onClick={handleCancelRouteEditing}
                    >
                      {t("app.cancel")}
                    </button>
                    <button
                      type="button"
                      id="finishModeButton"
                      className="mode-finish-bar"
                      onClick={handleFinishEditing}
                    >
                      {t("app.finish")}
                    </button>
                  </>
                ) : (
                  <button type="button" id="finishModeButton" className="mode-finish-bar" onClick={handleFinishEditing}>
                    {t("app.finish")}
                  </button>
                )}
              </div>
            )}
          </div>
          {adSidebarEnabled ? <AdSidebar /> : null}
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
          routeIds={statusDialog.routeIds}
          isNewRoute={statusDialog.isNewRoute === true}
          suppressAutoOpen={!autoShowNewRouteStatus}
          onSuppressAutoOpenChange={(suppress) => updateAutoShowNewRouteStatus(!suppress)}
          onClose={closeStatusDialog}
          onSaved={handleRouteMetadataSaved}
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
              <button
                type="button"
                className="app-file-menu-btn app-file-menu-btn--primary"
                onClick={handleFileMenuShare}
                title={t("share.menuTitle")}
              >
                {t("share.menuLabel")}
              </button>
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
              <button
                type="button"
                className="app-file-menu-btn app-file-menu-btn--danger"
                onClick={handleFileMenuReset}
                title={t("app.resetToDefaultTitle")}
              >
                {t("app.resetToDefault")}
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
      <ShareLinkDialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} />
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
                names: pendingImport.duplicateRouteLabels.join("、"),
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
