/**
 * Third-layer route table (RouteListPanel): tabular list with column toggles and filters.
 *
 * - Layers 1–2 (RouteListNavigator): country / city geo navigation via GeoNavList.
 * - Layer 3 (this panel): receives `routes={filteredRoutes}` for the selected city only.
 *   Column visibility (routeListColumnPrefs) and status/kind filters (routeListFilterPrefs)
 *   apply here; do not duplicate geo filters.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { Route } from "../map/routeModel.js";
import {
  getMergePickSubrouteIds,
  M,
  pickRouteForMerge,
  pickSubRouteForSplitLine,
  registerMergePickChange,
  setMode,
} from "../map/modeBundle.js";
import {
  buildRouteListGridTemplate,
  loadRouteListColumns,
  resolveRouteListColumns,
  ROUTE_LIST_COL_I18N_KEYS,
  ROUTE_LIST_TOGGLEABLE_COL_KEYS,
  saveRouteListColumns,
} from "./routeListColumnPrefs.js";
import {
  filterRouteListEntries,
  loadRouteListFilter,
  ROUTE_LIST_KIND_FILTER_I18N,
  ROUTE_LIST_KIND_FILTER_VALUES,
  ROUTE_LIST_STATUS_FILTER_I18N,
  ROUTE_LIST_STATUS_FILTER_VALUES,
  saveRouteListFilter,
} from "./routeListFilterPrefs.js";

function getRouteMergePickOrder(routes, mergePickSubrouteIds) {
  for (let i = 0; i < mergePickSubrouteIds.length; i++) {
    if (routes.some((r) => r.subroute_id === mergePickSubrouteIds[i])) return i + 1;
  }
  return 0;
}

export default function RouteListPanel({
  routes: routesOverride,
  tablePrefsRevision = 0,
  onRefresh,
  showRouteActions = false,
  mergeSelectMode = false,
  splitLineSelectMode = false,
  onEditRouteMetadata,
}) {
  const { t } = useI18n();
  const routeList = routesOverride ?? Route.getRouteList();
  const [selectedRouteIds, setSelectedRouteIds] = useState(() => new Set());
  const [mergePickSubrouteIds, setMergePickSubrouteIds] = useState(() => getMergePickSubrouteIds());
  const [columnVisibility, setColumnVisibility] = useState(() => loadRouteListColumns());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [listFilter, setListFilter] = useState(() => loadRouteListFilter());
  const [suppressRowEditUntil, setSuppressRowEditUntil] = useState(0);

  const bumpSuppressRowEdit = useCallback(() => {
    setSuppressRowEditUntil(Date.now() + 500);
  }, []);

  useEffect(() => {
    if (suppressRowEditUntil <= Date.now()) return;
    const id = setTimeout(() => {
      setSuppressRowEditUntil(0);
    }, suppressRowEditUntil - Date.now() + 1);
    return () => clearTimeout(id);
  }, [suppressRowEditUntil]);

  const clearSelection = useCallback(() => {
    setSelectedRouteIds(new Set());
  }, []);

  useEffect(() => {
    setColumnVisibility(loadRouteListColumns());
    setListFilter(loadRouteListFilter());
    setColumnsOpen(false);
  }, [tablePrefsRevision]);

  const listCols = useMemo(() => resolveRouteListColumns(columnVisibility), [columnVisibility]);

  const setColumnVisible = useCallback((key, visible) => {
    setColumnVisibility((prev) => {
      const next = { ...prev, [key]: visible };
      saveRouteListColumns(next);
      return next;
    });
  }, []);

  const setStatusFilter = useCallback(
    (statusFilter) => {
      setListFilter((prev) => {
        const next = { ...prev, statusFilter };
        saveRouteListFilter(next);
        return next;
      });
      bumpSuppressRowEdit();
    },
    [bumpSuppressRowEdit],
  );

  const setKindFilter = useCallback(
    (kindFilter) => {
      setListFilter((prev) => {
        const next = { ...prev, kindFilter };
        saveRouteListFilter(next);
        return next;
      });
      bumpSuppressRowEdit();
    },
    [bumpSuppressRowEdit],
  );

  const visibleRouteList = useMemo(
    () => filterRouteListEntries(routeList, listFilter),
    [routeList, listFilter],
  );

  const visibleRouteIds = useMemo(
    () => new Set(visibleRouteList.map((g) => g.route_id)),
    [visibleRouteList],
  );

  const visibleRouteIdsKey = useMemo(
    () => visibleRouteList.map((g) => g.route_id).join("\0"),
    [visibleRouteList],
  );

  useEffect(() => {
    setSelectedRouteIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(visibleRouteIdsKey ? visibleRouteIdsKey.split("\0") : []);
      const next = new Set(Array.from(prev).filter((id) => visible.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [visibleRouteIdsKey]);

  const gridTemplateColumns = useMemo(
    () => buildRouteListGridTemplate(showRouteActions, listCols),
    [showRouteActions, listCols],
  );
  const gridStyle = useMemo(() => ({ gridTemplateColumns }), [gridTemplateColumns]);

  // getRouteList() 每次 render 回傳新陣列，不可直接當 useEffect 依賴，否則會無限 setState。
  const routeIdsKey = routeList.map((g) => g.route_id).join("\0");

  useEffect(() => {
    const valid = new Set(routeIdsKey ? routeIdsKey.split("\0") : []);
    setSelectedRouteIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => valid.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [routeIdsKey]);

  useEffect(() => {
    if (!showRouteActions) {
      setSelectedRouteIds((prev) => (prev.size === 0 ? prev : new Set()));
    }
  }, [showRouteActions]);

  useEffect(() => {
    registerMergePickChange(() => setMergePickSubrouteIds(getMergePickSubrouteIds()));
  }, []);

  useEffect(() => {
    if (!mergeSelectMode) setMergePickSubrouteIds([]);
  }, [mergeSelectMode]);

  const listPickMode = mergeSelectMode || splitLineSelectMode;

  useEffect(() => {
    if (listPickMode) setColumnsOpen(false);
  }, [listPickMode]);

  const allSelected =
    visibleRouteList.length > 0 && visibleRouteList.every((g) => selectedRouteIds.has(g.route_id));
  const selectedCount = Array.from(selectedRouteIds).filter((id) => visibleRouteIds.has(id)).length;
  const hasSelection = selectedRouteIds.size > 0;
  const activeEditRouteId = showRouteActions ? Route.getActiveEditRouteId() : null;
  const toolbarLocked = !!activeEditRouteId;
  /** 已勾選至少一條時，點列僅切換勾選、不進入路線編輯 */
  const batchSelectMode = showRouteActions && hasSelection;
  /** 含篩選切換後的短暫緩衝，避免清空勾選或列表重排時誤觸編輯 */
  const blockRowEdit =
    showRouteActions && (hasSelection || Date.now() < suppressRowEditUntil);

  const handleFilterInteraction = useCallback(() => {
    if (hasSelection) bumpSuppressRowEdit();
  }, [bumpSuppressRowEdit, hasSelection]);

  const selectedVisibleRouteIds = useCallback(
    () => Array.from(selectedRouteIds).filter((id) => visibleRouteIds.has(id)),
    [selectedRouteIds, visibleRouteIds],
  );

  const toggleRouteSelect = (routeId) => {
    setSelectedRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = visibleRouteList.map((g) => g.route_id);
    setSelectedRouteIds((prev) => {
      const allVisibleSelected =
        visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const toggleSelectedVisibility = () => {
    const ids = selectedVisibleRouteIds();
    if (ids.length < 2) return;
    const hiddenCount = ids.filter((id) => Route.isRouteHidden(id)).length;
    if (hiddenCount === 0) {
      if (Route.setRoutesHidden(ids, true)) onRefresh();
    } else if (hiddenCount === ids.length) {
      if (Route.setRoutesHidden(ids, false)) onRefresh();
    }
  };

  const deleteSelected = () => {
    const ids = selectedVisibleRouteIds();
    if (ids.length === 0) return;
    if (!confirm(t("routeList.confirmDeleteMany", { count: ids.length }))) return;
    Route.deleteRoutes(ids);
    setSelectedRouteIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    onRefresh();
  };

  const handleMergeRoutePick = (line) => {
    const subrouteId = line.subroutes[0]?.subroute_id;
    if (!subrouteId) return;
    const result = pickRouteForMerge(subrouteId);
    if (result.merged) onRefresh();
  };

  const handleSplitRoutePick = (line) => {
    const subrouteId = line.subroutes[0]?.subroute_id;
    if (!subrouteId) return;
    const result = pickSubRouteForSplitLine(subrouteId);
    if (result.ok) onRefresh();
  };

  const exportSelected = () => {
    const ids = selectedVisibleRouteIds();
    const result = Route.exportRoutesJSON(ids);
    if (!result.ok) {
      if (result.error === "no_user_routes") {
        alert(t("routeList.exportNoUserRoutes"));
      }
      return;
    }
    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`route-list-inner${showRouteActions ? " route-list-inner--edit" : ""}${listPickMode ? " route-list-inner--pick" : ""}`}
    >
      {mergeSelectMode && (
        <div className="route-batch-toolbar route-merge-toolbar">
          <span className="route-merge-toolbar-hint">{t("routeList.mergePickHint")}</span>
          <span className="route-selected-count">{t("routeList.mergePickProgress", { n: mergePickSubrouteIds.length })}</span>
        </div>
      )}
      {splitLineSelectMode && (
        <div className="route-batch-toolbar route-merge-toolbar">
          <span className="route-merge-toolbar-hint">{t("routeList.splitLinePickHint")}</span>
        </div>
      )}
      {showRouteActions && (
        <div className="route-batch-toolbar route-batch-toolbar--edit">
          <div className="route-batch-toolbar-summary">
            <label className="route-select-all">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={toolbarLocked} />
              {t("routeList.selectAll")}
            </label>
            <span className="route-selected-count">{t("routeList.selected", { n: selectedCount })}</span>
          </div>
          {selectedCount >= 1 && (
            <div className="route-batch-toolbar-actions">
              <button type="button" onClick={clearSelection} disabled={toolbarLocked}>
                {t("routeList.clearSelection")}
              </button>
              <button
                type="button"
                onClick={exportSelected}
                title={t("routeList.exportSelectedTitle")}
              >
                {t("routeList.exportSelected")}
              </button>
              {selectedCount >= 2 && (() => {
                const ids = selectedVisibleRouteIds();
                const hiddenCount = ids.filter((id) => Route.isRouteHidden(id)).length;
                const allHidden = hiddenCount === ids.length;
                const mixedVisibility = hiddenCount > 0 && !allHidden;
                return (
                  <button
                    type="button"
                    onClick={toggleSelectedVisibility}
                    disabled={toolbarLocked || mixedVisibility}
                    title={mixedVisibility ? t("routeList.toggleVisibilityMixedTitle") : undefined}
                  >
                    {allHidden ? t("routeList.showRoutes") : t("routeList.hideRoutes")}
                  </button>
                );
              })()}
              {selectedCount >= 2 && (
                  <button type="button" onClick={deleteSelected} disabled={toolbarLocked}>
                    {t("routeList.deleteSelected")}
                  </button>
              )}
            </div>
          )}
        </div>
      )}
      <div
        className={`route-list-table-toolbar${showRouteActions ? " route-list-table-toolbar--edit" : ""}${listPickMode ? " route-list-table-toolbar--pick" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <RouteListFiltersControl
          statusFilter={listFilter.statusFilter}
          kindFilter={listFilter.kindFilter}
          onStatusFilterChange={setStatusFilter}
          onKindFilterChange={setKindFilter}
          onFilterInteraction={handleFilterInteraction}
          disabled={listPickMode}
          t={t}
        />
        <RouteListColumnsControl
          open={columnsOpen}
          onOpenChange={setColumnsOpen}
          columnVisibility={columnVisibility}
          onToggleColumn={setColumnVisible}
          disabled={listPickMode}
          t={t}
        />
        {listPickMode ? (
          <p className="route-list-table-toolbar-hint" role="status">
            {t("routeList.tableToolbarPickHint")}
          </p>
        ) : null}
      </div>
      {visibleRouteList.length === 0 ? (
        <p className="route-list-filter-empty" role="status">
          {t("routeList.filterEmpty")}
        </p>
      ) : (
        <>
      <div className="route-list-column-header route-list-column-header--grid" role="row" style={gridStyle}>
        <div className="route-row-lead" aria-hidden="true" />
        <div className="route-list-header-name">
          <span className="route-list-header-label">{t("routeList.colName")}</span>
        </div>
        {listCols.status && (
          <div className="route-list-header-status">
            <span className="route-list-header-label">{t("routeList.colStatus")}</span>
          </div>
        )}
        {listCols.kind && (
          <div className="route-list-header-tags">
            <span className="route-list-header-label">{t("routeList.colKind")}</span>
          </div>
        )}
        {showRouteActions && (
          <div className="route-row-trailing route-list-header-trailing">
            <span className="route-list-header-label">{t("routeList.colActions")}</span>
          </div>
        )}
      </div>
      {visibleRouteList.map((g) => {
        const currentName = g.subroutes[0]?.name ?? "";
        const mergePickOrder = mergeSelectMode ? getRouteMergePickOrder(g.subroutes, mergePickSubrouteIds) : 0;
        return (
          <RouteRow
            key={g.route_id}
            g={g}
            currentName={currentName}
            onRefresh={onRefresh}
            selected={selectedRouteIds.has(g.route_id)}
            onToggleSelect={() => toggleRouteSelect(g.route_id)}
            showRouteActions={showRouteActions}
            mergeSelectMode={mergeSelectMode}
            splitLineSelectMode={splitLineSelectMode}
            mergePickOrder={mergePickOrder}
            onMergePick={() => handleMergeRoutePick(g)}
            onSplitLinePick={() => handleSplitRoutePick(g)}
            activeEditRouteId={activeEditRouteId}
            batchSelectMode={batchSelectMode}
            blockRowEdit={blockRowEdit}
            suppressRowEditUntil={suppressRowEditUntil}
            cols={listCols}
            gridStyle={gridStyle}
            t={t}
            onEditRouteMetadata={onEditRouteMetadata}
          />
        );
      })}
        </>
      )}
    </div>
  );
}

function RouteListFiltersControl({
  statusFilter,
  kindFilter,
  onStatusFilterChange,
  onKindFilterChange,
  onFilterInteraction,
  disabled = false,
  t,
}) {
  const stopFilterPointer = (e) => {
    e.stopPropagation();
    onFilterInteraction?.();
  };

  return (
    <div
      className="route-list-filters"
      role="group"
      aria-label={t("routeList.filterGroupAria")}
      onMouseDown={stopFilterPointer}
      onMouseUp={stopFilterPointer}
      onClick={stopFilterPointer}
      onPointerDown={stopFilterPointer}
    >
      <span className="route-list-filter-label" id="route-list-filter-label">
        {t("routeList.filterLabel")}
      </span>
      <select
        className="route-list-filter-select"
        value={statusFilter}
        disabled={disabled}
        aria-label={t("routeList.filterStatusAria")}
        aria-labelledby="route-list-filter-label"
        onChange={(e) => onStatusFilterChange(e.target.value)}
      >
        <option value="all">{t("routeList.filterAll")}</option>
        {ROUTE_LIST_STATUS_FILTER_VALUES.filter((v) => v !== "all").map((value) => (
          <option key={value} value={value}>
            {t(ROUTE_LIST_STATUS_FILTER_I18N[value])}
          </option>
        ))}
      </select>
      <select
        className="route-list-filter-select"
        value={kindFilter}
        disabled={disabled}
        aria-label={t("routeList.filterKindAria")}
        onChange={(e) => onKindFilterChange(e.target.value)}
      >
        <option value="all">{t("routeList.filterAll")}</option>
        {ROUTE_LIST_KIND_FILTER_VALUES.filter((v) => v !== "all").map((value) => (
          <option key={value} value={value}>
            {t(ROUTE_LIST_KIND_FILTER_I18N[value])}
          </option>
        ))}
      </select>
    </div>
  );
}

function RouteListColumnsControl({
  open,
  onOpenChange,
  columnVisibility,
  onToggleColumn,
  disabled = false,
  t,
}) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open || disabled) return;
    const onPointerDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      onOpenChange(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange, disabled]);

  const toggleOpen = () => {
    if (disabled) return;
    onOpenChange(!open);
  };

  return (
    <div className="route-list-columns-control" ref={rootRef}>
      <button
        type="button"
        className={`route-list-columns-trigger${open ? " route-list-columns-trigger--open" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("routeList.columnsToggleAria")}
        disabled={disabled}
        title={disabled ? t("routeList.tableToolbarPickHint") : undefined}
        onClick={toggleOpen}
      >
        {t("routeList.columnsTitle")}
      </button>
      {open ? (
        <div
          className="route-list-columns-popover"
          role="dialog"
          aria-label={t("routeList.columnsTitle")}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {ROUTE_LIST_TOGGLEABLE_COL_KEYS.map((key) => (
            <label key={key} className="route-list-columns-option">
              <input
                type="checkbox"
                checked={columnVisibility[key]}
                onChange={(e) => onToggleColumn(key, e.target.checked)}
              />
              <span>{t(ROUTE_LIST_COL_I18N_KEYS[key])}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ROUTE_COLOR_PICKER_Z_INDEX = 1400;
const ROUTE_COLOR_POPOVER_WIDTH = 168;
const ROUTE_COLOR_POPOVER_GAP = 8;
const ROUTE_COLOR_TRIGGER_GAP = 6;
const ROUTE_COLOR_NATIVE_ANCHOR_SIZE = 28;
const ROUTE_COLOR_VIEW_MARGIN = 8;

function getEditControlsDockTop() {
  const dock = document.querySelector(".app-controls-dock");
  return dock ? dock.getBoundingClientRect().top : window.innerHeight;
}

function layoutRouteColorPickerUi(triggerEl, popoverEl) {
  if (!triggerEl || !popoverEl) return null;

  const tr = triggerEl.getBoundingClientRect();
  const dockTop = getEditControlsDockTop();
  const popoverHeight = popoverEl.offsetHeight;
  const popoverWidth = ROUTE_COLOR_POPOVER_WIDTH;

  const spaceBelowTrigger = dockTop - tr.bottom - ROUTE_COLOR_TRIGGER_GAP;
  const spaceAboveTrigger = tr.top - ROUTE_COLOR_VIEW_MARGIN;
  const placePopoverBelow = spaceBelowTrigger >= popoverHeight || spaceBelowTrigger >= spaceAboveTrigger;

  let popoverTop;
  let placement;
  if (placePopoverBelow) {
    popoverTop = tr.bottom + ROUTE_COLOR_TRIGGER_GAP;
    placement = "below";
  } else {
    popoverTop = Math.max(ROUTE_COLOR_VIEW_MARGIN, tr.top - popoverHeight - ROUTE_COLOR_TRIGGER_GAP);
    placement = "above";
  }

  let popoverLeft = tr.right - popoverWidth;
  popoverLeft = Math.max(
    ROUTE_COLOR_VIEW_MARGIN,
    Math.min(popoverLeft, window.innerWidth - popoverWidth - ROUTE_COLOR_VIEW_MARGIN),
  );

  const popoverBottom = popoverTop + popoverHeight;
  const spaceBelowPopover = dockTop - popoverBottom - ROUTE_COLOR_POPOVER_GAP;
  const nativeBelowPopover = spaceBelowPopover >= ROUTE_COLOR_NATIVE_ANCHOR_SIZE;

  let nativeTop;
  if (nativeBelowPopover) {
    nativeTop = popoverBottom + ROUTE_COLOR_POPOVER_GAP;
  } else {
    nativeTop = Math.max(ROUTE_COLOR_VIEW_MARGIN, popoverTop - ROUTE_COLOR_NATIVE_ANCHOR_SIZE - ROUTE_COLOR_POPOVER_GAP);
  }
  const nativeLeft = popoverLeft + (popoverWidth - ROUTE_COLOR_NATIVE_ANCHOR_SIZE) / 2;

  return {
    placement,
    popoverStyle: {
      position: "fixed",
      top: `${popoverTop}px`,
      left: `${popoverLeft}px`,
      width: `${popoverWidth}px`,
      zIndex: ROUTE_COLOR_PICKER_Z_INDEX,
    },
    nativeAnchorStyle: {
      position: "fixed",
      top: `${nativeTop}px`,
      left: `${nativeLeft}px`,
      width: `${ROUTE_COLOR_NATIVE_ANCHOR_SIZE}px`,
      height: `${ROUTE_COLOR_NATIVE_ANCHOR_SIZE}px`,
      zIndex: ROUTE_COLOR_PICKER_Z_INDEX,
    },
  };
}

function normalizeRouteHexColor(input) {
  const raw = String(input ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase()}`;
  }
  return null;
}

function RouteColorPicker({ routeId, color, disabled, onRefresh }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(color);
  const [hexText, setHexText] = useState(color);
  const originalColorRef = useRef(color);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const layerRef = useRef(null);
  const popoverRef = useRef(null);
  const nativeColorInputRef = useRef(null);
  const openRef = useRef(false);
  const suppressOutsideCloseRef = useRef(false);
  const previewRafRef = useRef(null);
  const pendingPreviewColorRef = useRef(null);
  const [placement, setPlacement] = useState("below");
  const [popoverStyle, setPopoverStyle] = useState(null);
  const [nativeAnchorStyle, setNativeAnchorStyle] = useState(null);

  const syncPickerLayout = useCallback(() => {
    const layout = layoutRouteColorPickerUi(triggerRef.current, popoverRef.current);
    if (!layout) return;
    setPlacement(layout.placement);
    setPopoverStyle(layout.popoverStyle);
    setNativeAnchorStyle(layout.nativeAnchorStyle);
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setDraft(color);
      setHexText(color);
      setPopoverStyle(null);
      setNativeAnchorStyle(null);
      setPlacement("below");
    }
  }, [color, open]);

  const cancelPendingMapPreview = useCallback(() => {
    if (previewRafRef.current) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    pendingPreviewColorRef.current = null;
  }, []);

  const flushMapColorPreview = useCallback(() => {
    previewRafRef.current = null;
    const next = pendingPreviewColorRef.current;
    if (next != null) Route.setRouteColor(routeId, next, { preview: true });
  }, [routeId]);

  const previewOnMap = useCallback(
    (nextColor) => {
      setDraft(nextColor);
      setHexText(nextColor);
      pendingPreviewColorRef.current = nextColor;
      if (previewRafRef.current == null) {
        previewRafRef.current = requestAnimationFrame(flushMapColorPreview);
      }
    },
    [flushMapColorPreview],
  );

  const revertPreview = useCallback(() => {
    cancelPendingMapPreview();
    Route.setRouteColor(routeId, originalColorRef.current);
  }, [cancelPendingMapPreview, routeId]);

  const revertAndClose = useCallback(() => {
    revertPreview();
    onRefresh();
    setOpen(false);
  }, [onRefresh, revertPreview]);

  useEffect(() => {
    if (!open) return;
    const onWindowBlur = () => {
      suppressOutsideCloseRef.current = true;
    };
    const onWindowFocus = () => {
      window.setTimeout(() => {
        suppressOutsideCloseRef.current = false;
      }, 0);
    };
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    syncPickerLayout();
    const scrollEl = document.querySelector(".route-list-sidebar-scroll");
    const onReposition = () => syncPickerLayout();
    window.addEventListener("resize", onReposition);
    scrollEl?.addEventListener("scroll", onReposition, { passive: true });
    return () => {
      window.removeEventListener("resize", onReposition);
      scrollEl?.removeEventListener("scroll", onReposition);
    };
  }, [open, syncPickerLayout]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (suppressOutsideCloseRef.current) return;
      if (rootRef.current?.contains(e.target)) return;
      if (layerRef.current?.contains(e.target)) return;
      revertAndClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, revertAndClose]);

  const togglePicker = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (disabled) return;
    if (openRef.current) {
      revertAndClose();
      return;
    }
    originalColorRef.current = color;
    setDraft(color);
    setHexText(color);
    setOpen(true);
  };

  const commitHexField = () => {
    const next = normalizeRouteHexColor(hexText);
    if (next) previewOnMap(next);
    else setHexText(draft);
  };

  const openNativeColorPicker = (e) => {
    e.stopPropagation();
    e.preventDefault();
    syncPickerLayout();
    requestAnimationFrame(() => {
      syncPickerLayout();
      nativeColorInputRef.current?.click();
    });
  };

  const confirm = (e) => {
    e.stopPropagation();
    e.preventDefault();
    cancelPendingMapPreview();
    const next = normalizeRouteHexColor(hexText) ?? draft;
    Route.setRouteColor(routeId, next);
    onRefresh();
    setOpen(false);
  };

  const cancel = (e) => {
    e.stopPropagation();
    e.preventDefault();
    revertAndClose();
  };

  const displayColor = open ? draft : color;

  const pickerPortal = open
    ? createPortal(
          <div ref={layerRef} className="route-color-picker-layer">
            <div
              ref={popoverRef}
              className={`route-color-picker-popover route-color-picker-popover--portal route-color-picker-popover--placement-${placement}`}
              style={{
                ...(popoverStyle ?? { position: "fixed", left: "-9999px", top: 0 }),
                visibility: popoverStyle ? "visible" : "hidden",
              }}
              role="dialog"
              aria-label={t("routeList.colorTitle")}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className="route-color-picker-native-btn" onClick={openNativeColorPicker}>
                {t("routeList.colorOpenNative")}
              </button>
              <label className="route-color-picker-hex-field">
                <span className="route-color-picker-hex-label">{t("routeList.colorHexLabel")}</span>
                <input
                  type="text"
                  className="route-color-picker-hex-input"
                  value={hexText}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={7}
                  onChange={(e) => setHexText(e.target.value)}
                  onBlur={commitHexField}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      commitHexField();
                    }
                  }}
                />
              </label>
              <div className="route-color-picker-actions">
                <button type="button" className="route-color-picker-btn route-color-picker-btn--cancel" onClick={cancel}>
                  {t("app.cancel")}
                </button>
                <button type="button" className="route-color-picker-btn route-color-picker-btn--done" onClick={confirm}>
                  {t("app.finish")}
                </button>
              </div>
            </div>
            <input
              ref={nativeColorInputRef}
              type="color"
              className="route-color-picker-native-anchor"
              style={nativeAnchorStyle ?? undefined}
              value={draft}
              tabIndex={-1}
              aria-hidden
              onInput={(e) => previewOnMap(e.target.value)}
              onChange={(e) => previewOnMap(e.target.value)}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        className={`route-color-picker${open ? " route-color-picker--open" : ""}`}
        ref={rootRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={triggerRef}
          type="button"
          className="route-color-picker-trigger"
          style={{ backgroundColor: displayColor }}
          title={t("routeList.colorTitle")}
          aria-label={t("routeList.colorTitle")}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={togglePicker}
        >
          <span className="route-color-picker-trigger-ring" aria-hidden />
        </button>
      </div>
      {pickerPortal}
    </>
  );
}

function RouteRow({
  g,
  currentName,
  onRefresh,
  selected,
  onToggleSelect,
  showRouteActions,
  mergeSelectMode = false,
  splitLineSelectMode = false,
  mergePickOrder = 0,
  onMergePick,
  onSplitLinePick,
  activeEditRouteId,
  batchSelectMode = false,
  blockRowEdit = false,
  suppressRowEditUntil = 0,
  cols,
  gridStyle,
  t,
  onEditRouteMetadata,
}) {
  const rowEditPressRef = useRef(false);

  const isRowEditExcludedTarget = (target) => {
    if (!(target instanceof Element)) return true;
    if (
      target.closest(
        ".route-row-trailing, .route-row-status-col, .route-row-kind-col",
      )
    ) {
      return true;
    }
    if (target.closest("button, input, label, a, select, textarea")) return true;
    return false;
  };

  const handleMouseEnter = () => {
    Route.highlightRoute(g.subroutes[0].subroute_id);
  };
  const handleMouseLeave = () => {
    Route.clearHover();
  };

  const isActiveEditingRow = !!activeEditRouteId && activeEditRouteId === g.route_id;
  const isLockedByOtherRow = !!activeEditRouteId && activeEditRouteId !== g.route_id;
  const disableHideShow = isLockedByOtherRow || isActiveEditingRow;
  const disableRowActions = isLockedByOtherRow;

  const startEdit = (e) => {
    rowEditPressRef.current = false;
    if (Date.now() < suppressRowEditUntil) return;
    if (!showRouteActions || disableRowActions || blockRowEdit) return;
    if (isRowEditExcludedTarget(e.target)) return;
    rowEditPressRef.current = true;
    Route.clearHover();
    M.suppressNextEditMapClick = true;
    Route.startEditRoute(g.route_id);
  };

  const endMouseUp = (e) => {
    if (!rowEditPressRef.current) return;
    rowEditPressRef.current = false;
    if (Date.now() < suppressRowEditUntil) return;
    if (!showRouteActions || disableRowActions || blockRowEdit) return;
    if (isRowEditExcludedTarget(e.target)) return;
    setMode("edit-route-active");
  };

  const handleBatchRowClick = (e) => {
    if (!batchSelectMode || mergeSelectMode) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "B") return;
    onToggleSelect();
  };

  const handleMergeRowClick = (e) => {
    if (!mergeSelectMode) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "B") return;
    onMergePick?.();
  };

  const handleSplitRouteRowClick = (e) => {
    if (!splitLineSelectMode) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "B") return;
    onSplitLinePick?.();
  };

  const listPickMode = mergeSelectMode || splitLineSelectMode;
  const rowClass =
    `route-header route-item route-list-row-grid${showRouteActions ? (batchSelectMode ? " route-item-batch-select" : "") : listPickMode ? " route-item-merge-select" : " route-item-readonly"}${isActiveEditingRow ? " route-item-active-edit" : ""}${isLockedByOtherRow ? " route-item-disabled" : ""}${mergePickOrder > 0 ? " route-item-merge-picked" : ""}`;

  const status = g.status ?? Route.ROUTE_STATUS_CUSTOM;
  const statusLabelKey = {
    [Route.ROUTE_STATUS_OPERATING]: "routeStatus.operating",
    [Route.ROUTE_STATUS_PLANNING]: "routeStatus.planning",
    [Route.ROUTE_STATUS_CONSTRUCTION]: "routeStatus.construction",
    [Route.ROUTE_STATUS_CUSTOM]: "routeStatus.custom",
  }[status];

  const statusBadge = (
    <span
      className={`route-list-badge route-status-badge route-status-${status}`}
      title={t("routeList.statusBadgeTitle")}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {t(statusLabelKey)}
    </span>
  );

  const kindBadge = (
    <span
      className={`route-list-badge route-kind-badge route-row-tags-kind route-kind-${g.route_kind === Route.ROUTE_KIND_DEFAULT ? "default" : "user"}`}
      title={t("routeList.kindBadgeTitle")}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {g.route_kind === Route.ROUTE_KIND_DEFAULT ? t("routeList.kindDefault") : t("routeList.kindUser")}
    </span>
  );

  const isRouteHidden = Route.isRouteHidden(g.route_id);

  const trailingActions = showRouteActions && (
    <div className="route-row-trailing">
      <RouteColorPicker
        routeId={g.route_id}
        color={g.subroutes[0]?.color || "#1e88e5"}
        disabled={disableRowActions}
        onRefresh={onRefresh}
      />
      <button
        type="button"
        className="route-row-action-btn"
        disabled={disableRowActions}
        title={t("routeList.routeInfoTitle")}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onEditRouteMetadata?.(g.route_id);
        }}
      >
        {t("routeList.routeInfo")}
      </button>
      <button
        type="button"
        className="route-row-action-btn"
        disabled={disableHideShow}
        title={isRouteHidden ? t("routeList.show") : t("routeList.hide")}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          Route.setRouteHidden(g.route_id, !isRouteHidden);
          onRefresh();
        }}
      >
        {isRouteHidden ? t("routeList.show") : t("routeList.hide")}
      </button>
      <button
        type="button"
        className="delete-route-btn"
        disabled={disableRowActions}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (confirm(t("routeList.confirmDeleteLine", { id: g.route_id }))) {
            Route.deleteRoute(g.route_id);
            onRefresh();
          }
        }}
      >
        {t("routeList.deleteRoute")}
      </button>
    </div>
  );

  return (
    <div
      className={rowClass}
      style={gridStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={showRouteActions && !blockRowEdit ? startEdit : undefined}
      onMouseUp={showRouteActions && !blockRowEdit ? endMouseUp : undefined}
      onClick={
        mergeSelectMode
          ? handleMergeRowClick
          : splitLineSelectMode
            ? handleSplitRouteRowClick
            : batchSelectMode
              ? handleBatchRowClick
              : undefined
      }
    >
      <div className="route-row-lead">
        {listPickMode ? (
          <span
            className="route-color-swatch"
            style={{ backgroundColor: g.subroutes[0]?.color || "#1e88e5" }}
            aria-hidden
          />
        ) : showRouteActions ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            disabled={disableRowActions || isActiveEditingRow}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="route-color-swatch"
            style={{ backgroundColor: g.subroutes[0]?.color || "#1e88e5" }}
            aria-hidden
          />
        )}
      </div>
      <div className="route-row-name-col route-row-title-text">
        <RouteName
          routeId={g.route_id}
          initialName={currentName}
          onSaved={onRefresh}
          allowRename={showRouteActions}
        />
      </div>
      {cols.status && <div className="route-row-status-col">{statusBadge}</div>}
      {cols.kind && <div className="route-row-kind-col">{kindBadge}</div>}
      {trailingActions}
    </div>
  );
}

function RouteName({ routeId, initialName, onSaved, allowRename }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!allowRename) setEditing(false);
  }, [allowRename]);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (allowRename && editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className="route-name-input"
        value={name}
        maxLength={15}
        onChange={(e) => setName(e.target.value.slice(0, 15))}
        onBlur={() => {
          Route.setRouteName(routeId, name);
          setEditing(false);
          onSaved();
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            Route.setRouteName(routeId, name);
            setEditing(false);
            onSaved();
          } else if (ev.key === "Escape") {
            setName(initialName);
            setEditing(false);
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <b
      onDoubleClick={
        allowRename
          ? (e) => {
              e.stopPropagation();
              setEditing(true);
            }
          : undefined
      }
    >
      {name}
    </b>
  );
}
