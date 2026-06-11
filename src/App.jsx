import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./App.css";
import MapView from "./components/MapView.jsx";
import RouteListNavigator from "./components/RouteListNavigator.jsx";
import RouteStatusDialog from "./components/RouteStatusDialog.jsx";
import { setMode, cancelRouteEditing, finishEditing, exitEditRouteSelectMode } from "./map/modeController.js";
import { Route } from "./map/routeModel.js";
import { useMetroMapMode } from "./metro/useMetroMapMode.js";
import { useMetroMapInteraction } from "./metro/useMetroMapInteraction.js";
import { useMetroShareView } from "./metro/useMetroShareView.js";
import { useMetroImportUndoAvailable } from "./metro/useMetroImportUndoAvailable.js";
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
import { installViewportSync } from "./site/viewportSync.js";
import { useRouteListWidth } from "./app/useRouteListWidth.js";
import { dismissSharePathIfPresent, useShareBootstrap } from "./app/useShareBootstrap.js";
import { useAppImportActions } from "./app/useAppImportActions.js";
import AppEditToolsPanel from "./components/AppEditToolsPanel.jsx";
import AppMapFinishBar from "./components/AppMapFinishBar.jsx";
import AppFileMenuDialog from "./components/AppFileMenuDialog.jsx";
import AppImportConflictDialog from "./components/AppImportConflictDialog.jsx";

const AUTO_SHOW_NEW_ROUTE_STATUS_KEY = "metro-auto-show-new-route-status";
const adSidebarEnabled = isAdSidebarEnabled();

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
  const mode = useMetroMapMode();
  const { modeHint, editStationSubmode } = useMetroMapInteraction();
  const importUndoAvailable = useMetroImportUndoAvailable();
  const { shareViewActive, shareViewExpiresAt } = useMetroShareView();
  const { routeListWidthPx, startRouteListResize } = useRouteListWidth();
  /** 未開啟時側欄內其他按鈕皆停用（僅「編輯模式」可切換） */
  const [editToolsOpen, setEditToolsOpen] = useState(false);
  const onShareBootstrapReady = useCallback((mapView) => {
    setEditToolsOpen(false);
    setMode("general");
    requestImportedMapView(mapView);
  }, []);
  const { shareBootstrap, dismissShareLoadError, resetShareBootstrap, setShareBootstrap } = useShareBootstrap({
    onReady: onShareBootstrapReady,
  });
  const {
    importInputRef,
    pendingImport,
    importErrorMessage,
    handleImportFile,
    handleExportMap,
    handleUndoLastImport,
    closeImportDialog,
    confirmImportWithMode,
    handleImportMapClick,
  } = useAppImportActions(t);
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

  const handleRouteMetadataSaved = (payload) => {
    if (payload?.country != null && payload?.region != null) {
      setRouteListGeoFocus({
        country: payload.country,
        region: payload.region,
        seq: Date.now(),
      });
    }
  };

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
  }, [shareViewActive, shareBootstrap.phase, locale, t]);

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
    requestAnimationFrame(() => {});
  };

  const handleCancelRouteEditing = () => {
    cancelRouteEditing();
    requestAnimationFrame(() => {});
  };

  const handleExitEditRouteSelect = () => {
    exitEditRouteSelectMode();
    requestAnimationFrame(() => {});
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
    requestAnimationFrame(() => {});
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

  const tryStartAddRoute = () => {
    const check = Route.assertCanAddUserRoutes(1);
    if (!check.ok) {
      alert(t("routeModel.routeLimitReached", { limit: check.limit, current: check.current }));
      return;
    }
    setMode("add-route");
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
    resetShareBootstrap();
  };

  const handleAdoptShareView = async () => {
    setShareActionBusy(true);
    const result = Route.adoptShareToMyMap();
    setShareActionBusy(false);
    if (!result.ok) {
      if (result.error) alert(importErrorMessage(result.error, result));
      return;
    }
    resetShareBootstrap();
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

  const handleFileMenuReset = () => {
    if (!window.confirm(t("app.resetToDefaultConfirm"))) return;
    closeFileMenu();
    Route.resetToDefaultState();
    clearSiteLocalStorage();
    dismissSharePathIfPresent(setShareBootstrap);
    window.location.reload();
  };

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
            onClick={dismissShareLoadError}
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
            <AppEditToolsPanel
              t={t}
              editToolsOpen={editToolsOpen}
              toggleEditTools={toggleEditTools}
              editModeToggleLocked={editModeToggleLocked}
              shareViewActive={shareViewActive}
              toolsDisabled={toolsDisabled}
              modeBtnDisabled={modeBtnDisabled}
              mode={mode}
              isEditRouteMode={isEditRouteMode}
              showMergeCancel={showMergeCancel}
              showEditStationSubmodeButtons={showEditStationSubmodeButtons}
              editStationSubmode={editStationSubmode}
              openFileMenu={openFileMenu}
              tryStartAddRoute={tryStartAddRoute}
            />
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
            <MapView />
            {shareViewActive ? (
              <ShareViewBanner
                expiresAt={shareViewExpiresAt}
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
            <AppMapFinishBar
              t={t}
              showFinish={showFinish}
              editToolsOpen={editToolsOpen}
              showEditRouteActiveCommitActions={showEditRouteActiveCommitActions}
              showEditRouteSelectEndAction={showEditRouteSelectEndAction}
              showAddRouteCommitActions={showAddRouteCommitActions}
              activeEditRouteId={activeEditRouteId}
              shareViewActive={shareViewActive}
              onFinishEditing={handleFinishEditing}
              onCancelRouteEditing={handleCancelRouteEditing}
              onExitEditRouteSelect={handleExitEditRouteSelect}
              onDeleteActiveRouteOnMap={handleDeleteActiveRouteOnMap}
            />
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
      <AppFileMenuDialog
        t={t}
        open={fileMenuOpen}
        importUndoAvailable={importUndoAvailable}
        onClose={closeFileMenu}
        onShare={handleFileMenuShare}
        onExport={handleFileMenuExport}
        onImport={handleFileMenuImport}
        onUndo={handleFileMenuUndo}
        onReset={handleFileMenuReset}
      />
      <ShareLinkDialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} />
      <AppImportConflictDialog
        t={t}
        pendingImport={pendingImport}
        onClose={closeImportDialog}
        onConfirm={confirmImportWithMode}
      />
    </div>
  );
}

export default App;
