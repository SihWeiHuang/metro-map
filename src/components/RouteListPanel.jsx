import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { Route } from "../map/routeModel.js";
import {
  getMergePickRouteIds,
  M,
  pickRouteForMerge,
  pickRouteForUngroup,
  registerMergePickChange,
  setMode,
} from "../map/modeBundle.js";
import {
  buildRouteListGridTemplate,
  defaultRouteListColumns,
} from "./routeListColumnPrefs.js";

function getGroupMergePickOrder(routes, mergePickRouteIds) {
  for (let i = 0; i < mergePickRouteIds.length; i++) {
    if (routes.some((r) => r.route_id === mergePickRouteIds[i])) return i + 1;
  }
  return 0;
}

export default function RouteListPanel({
  onRefresh,
  showRouteActions = false,
  mergeSelectMode = false,
  ungroupSelectMode = false,
  onEditRouteMetadata,
}) {
  const { t } = useI18n();
  const groupList = Route.getGroupList();
  const [selectedGroupIds, setSelectedGroupIds] = useState(() => new Set());
  const [mergePickRouteIds, setMergePickRouteIds] = useState(() => getMergePickRouteIds());
  const [columnVisibility] = useState(defaultRouteListColumns);

  const listCols = useMemo(
    () => ({
      ...columnVisibility,
      kind: showRouteActions ? false : columnVisibility.kind,
    }),
    [columnVisibility, showRouteActions],
  );

  const gridTemplateColumns = useMemo(
    () => buildRouteListGridTemplate(showRouteActions, listCols),
    [showRouteActions, listCols],
  );
  const gridStyle = useMemo(() => ({ gridTemplateColumns }), [gridTemplateColumns]);

  useEffect(() => {
    const valid = new Set(groupList.map((g) => g.group_id));
    setSelectedGroupIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => valid.has(id)));
      return next;
    });
  }, [groupList]);

  useEffect(() => {
    if (!showRouteActions) setSelectedGroupIds(new Set());
  }, [showRouteActions]);

  useEffect(() => {
    registerMergePickChange(() => setMergePickRouteIds(getMergePickRouteIds()));
  }, []);

  useEffect(() => {
    if (!mergeSelectMode) setMergePickRouteIds([]);
  }, [mergeSelectMode]);

  const allSelected = groupList.length > 0 && selectedGroupIds.size === groupList.length;
  const selectedCount = selectedGroupIds.size;
  const activeEditGroupId = showRouteActions ? Route.getActiveEditGroupId() : null;
  const toolbarLocked = !!activeEditGroupId;
  /** 已勾選至少一條時，禁止點列進入臨時編輯，僅能繼續勾選 */
  const blockRowEdit = showRouteActions && selectedGroupIds.size > 0;

  const visibleGroupList = groupList;

  const toggleGroupSelect = (groupId) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedGroupIds((prev) => {
      if (groupList.length > 0 && prev.size === groupList.length) return new Set();
      return new Set(groupList.map((g) => g.group_id));
    });
  };

  const hideSelected = () => {
    selectedGroupIds.forEach((gid) => Route.setGroupHidden(gid, true));
    onRefresh();
  };

  const showSelected = () => {
    selectedGroupIds.forEach((gid) => Route.setGroupHidden(gid, false));
    onRefresh();
  };

  const deleteSelected = () => {
    if (selectedGroupIds.size === 0) return;
    if (!confirm(t("routeList.confirmDeleteMany", { count: selectedGroupIds.size }))) return;
    Route.deleteGroups(Array.from(selectedGroupIds));
    setSelectedGroupIds(new Set());
    onRefresh();
  };

  const handleMergeGroupPick = (group) => {
    const routeId = group.routes[0]?.route_id;
    if (!routeId) return;
    const result = pickRouteForMerge(routeId);
    if (result.merged) onRefresh();
  };

  const handleUngroupGroupPick = (group) => {
    const routeId = group.routes[0]?.route_id;
    if (!routeId) return;
    const result = pickRouteForUngroup(routeId);
    if (result.ok) onRefresh();
  };

  const exportSelected = () => {
    const result = Route.exportGroupsJSON(Array.from(selectedGroupIds));
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
    <div className={`route-list-inner${showRouteActions ? " route-list-inner--edit" : ""}`}>
      {mergeSelectMode && (
        <div className="route-batch-toolbar route-merge-toolbar">
          <span className="route-merge-toolbar-hint">{t("routeList.mergePickHint")}</span>
          <span className="route-selected-count">{t("routeList.mergePickProgress", { n: mergePickRouteIds.length })}</span>
        </div>
      )}
      {ungroupSelectMode && (
        <div className="route-batch-toolbar route-merge-toolbar">
          <span className="route-merge-toolbar-hint">{t("routeList.ungroupPickHint")}</span>
        </div>
      )}
      {showRouteActions && (
        <div className="route-batch-toolbar">
          <label className="route-select-all">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={toolbarLocked} />
            {t("routeList.selectAll")}
          </label>
          <span className="route-selected-count">{t("routeList.selected", { n: selectedCount })}</span>
          {selectedCount >= 1 && (
            <button
              type="button"
              onClick={exportSelected}
              title={t("routeList.exportSelectedTitle")}
            >
              {t("routeList.exportSelected")}
            </button>
          )}
          {selectedCount >= 2 && (
            <>
              <button type="button" onClick={hideSelected} disabled={toolbarLocked}>
                {t("routeList.hideRoutes")}
              </button>
              <button type="button" onClick={showSelected} disabled={toolbarLocked}>
                {t("routeList.showRoutes")}
              </button>
              <button type="button" onClick={deleteSelected} disabled={toolbarLocked}>
                {t("routeList.deleteSelected")}
              </button>
            </>
          )}
        </div>
      )}
      <div className="route-list-column-header route-list-column-header--grid" role="row" style={gridStyle}>
        <div className="route-row-lead" aria-hidden="true" />
        <div className="route-list-header-name">
          <span className="route-list-header-label">{t("routeList.colName")}</span>
        </div>
        {listCols.kind && (
          <div className="route-list-header-tags">
            <span className="route-list-header-label">{t("routeList.colKind")}</span>
          </div>
        )}
        {showRouteActions && listCols.actions && (
          <div className="group-row-trailing route-list-header-trailing">
            <span className="route-list-header-label">{t("routeList.colActions")}</span>
          </div>
        )}
      </div>
      {visibleGroupList.map((g) => {
        const currentName = g.routes[0]?.name || t("routeList.groupFallback", { id: g.group_id });
        const mergePickOrder = mergeSelectMode ? getGroupMergePickOrder(g.routes, mergePickRouteIds) : 0;
        return (
          <GroupRow
            key={g.group_id}
            g={g}
            currentName={currentName}
            onRefresh={onRefresh}
            selected={selectedGroupIds.has(g.group_id)}
            onToggleSelect={() => toggleGroupSelect(g.group_id)}
            showRouteActions={showRouteActions}
            mergeSelectMode={mergeSelectMode}
            ungroupSelectMode={ungroupSelectMode}
            mergePickOrder={mergePickOrder}
            onMergePick={() => handleMergeGroupPick(g)}
            onUngroupPick={() => handleUngroupGroupPick(g)}
            activeEditGroupId={activeEditGroupId}
            blockRowEdit={blockRowEdit}
            cols={listCols}
            gridStyle={gridStyle}
            t={t}
            onEditRouteMetadata={onEditRouteMetadata}
          />
        );
      })}
    </div>
  );
}

function GroupRow({
  g,
  currentName,
  onRefresh,
  selected,
  onToggleSelect,
  showRouteActions,
  mergeSelectMode = false,
  ungroupSelectMode = false,
  mergePickOrder = 0,
  onMergePick,
  onUngroupPick,
  activeEditGroupId,
  blockRowEdit = false,
  cols,
  gridStyle,
  t,
  onEditRouteMetadata,
}) {
  const handleMouseEnter = () => {
    Route.highlightRoute(g.routes[0].route_id);
  };
  const handleMouseLeave = () => {
    Route.clearHover();
  };

  const isActiveEditingRow = !!activeEditGroupId && activeEditGroupId === g.group_id;
  const isLockedByOtherRow = !!activeEditGroupId && activeEditGroupId !== g.group_id;
  const disableHideShow = isLockedByOtherRow || isActiveEditingRow;
  const disableRowActions = isLockedByOtherRow;

  const startEdit = (e) => {
    if (!showRouteActions || disableRowActions || blockRowEdit) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "B") return;
    Route.clearHover();
    M.suppressNextEditMapClick = true;
    Route.startEditGroup(g.group_id);
  };

  const endMouseUp = (e) => {
    if (!showRouteActions || disableRowActions || blockRowEdit) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "B") return;
    setMode("edit-route-active");
  };

  const handleBatchRowClick = (e) => {
    if (!blockRowEdit || mergeSelectMode) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "B") return;
    onToggleSelect();
  };

  const handleMergeRowClick = (e) => {
    if (!mergeSelectMode) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "B") return;
    onMergePick?.();
  };

  const handleUngroupRowClick = (e) => {
    if (!ungroupSelectMode) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "B") return;
    onUngroupPick?.();
  };

  const listPickMode = mergeSelectMode || ungroupSelectMode;
  const rowClass =
    `group-header route-item route-list-row-grid${showRouteActions ? (blockRowEdit ? " route-item-batch-select" : "") : listPickMode ? " route-item-merge-select" : " route-item-readonly"}${isActiveEditingRow ? " route-item-active-edit" : ""}${isLockedByOtherRow ? " route-item-disabled" : ""}${mergePickOrder > 0 ? " route-item-merge-picked" : ""}`;

  const status = g.status ?? Route.ROUTE_STATUS_CUSTOM;
  const statusLabelKey = {
    [Route.ROUTE_STATUS_OPERATING]: "routeStatus.operating",
    [Route.ROUTE_STATUS_PLANNING]: "routeStatus.planning",
    [Route.ROUTE_STATUS_CONSTRUCTION]: "routeStatus.construction",
    [Route.ROUTE_STATUS_CUSTOM]: "routeStatus.custom",
  }[status];

  const typeTags = (
    <div className="route-row-tags-inner">
      {/* 左側：營運狀態與日後新增標籤 */}
      <div className="route-row-tags-meta">
        <span
          className={`route-list-badge route-status-badge route-status-${status}`}
          title={t("routeList.statusBadgeTitle")}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {t(statusLabelKey)}
        </span>
      </div>
      {/* 右側固定：使用者／內建（勿移除此區塊順序） */}
      <span
        className={`route-list-badge route-kind-badge route-row-tags-kind route-kind-${g.route_kind === Route.ROUTE_KIND_DEFAULT ? "default" : "user"}`}
        title={t("routeList.kindBadgeTitle")}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {g.route_kind === Route.ROUTE_KIND_DEFAULT ? t("routeList.kindDefault") : t("routeList.kindUser")}
      </span>
    </div>
  );

  const trailingActions = showRouteActions && cols.actions && (
    <div className="group-row-trailing">
      <input
        type="color"
        className="group-color-input"
        defaultValue={g.routes[0]?.color || "#1e88e5"}
        title={t("routeList.colorTitle")}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        disabled={disableRowActions}
        onChange={(e) => {
          Route.setGroupColor(g.group_id, e.target.value);
          Route.clearHover();
          onRefresh();
        }}
        onBlur={() => {
          Route.clearHover();
        }}
      />
      <button
        type="button"
        className="route-row-action-btn"
        disabled={disableRowActions}
        title={t("routeList.routeInfoTitle")}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onEditRouteMetadata?.(g.group_id);
        }}
      >
        {t("routeList.routeInfo")}
      </button>
      <button
        type="button"
        className="route-row-action-btn"
        disabled={disableHideShow || Route.isGroupHidden(g.group_id)}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          Route.setGroupHidden(g.group_id, true);
          onRefresh();
        }}
      >
        {t("routeList.hide")}
      </button>
      <button
        type="button"
        className="route-row-action-btn"
        disabled={disableHideShow || !Route.isGroupHidden(g.group_id)}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          Route.setGroupHidden(g.group_id, false);
          onRefresh();
        }}
      >
        {t("routeList.show")}
      </button>
      <button
        type="button"
        className="delete-group-btn"
        disabled={disableRowActions}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (confirm(t("routeList.confirmDeleteGroup", { id: g.group_id }))) {
            Route.deleteGroup(g.group_id);
            onRefresh();
          }
        }}
      >
        {t("routeList.deleteGroup")}
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
          : ungroupSelectMode
            ? handleUngroupRowClick
            : blockRowEdit
              ? handleBatchRowClick
              : undefined
      }
    >
      <div className="route-row-lead">
        {listPickMode ? (
          <span
            className="route-color-swatch"
            style={{ backgroundColor: g.routes[0]?.color || "#1e88e5" }}
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
            style={{ backgroundColor: g.routes[0]?.color || "#1e88e5" }}
            aria-hidden
          />
        )}
      </div>
      <div className="route-row-name-col route-row-title-text">
        <GroupName
          groupId={g.group_id}
          initialName={currentName}
          onSaved={onRefresh}
          allowRename={showRouteActions}
        />
      </div>
      {cols.kind && <div className="route-row-tags-col">{typeTags}</div>}
      {trailingActions}
    </div>
  );
}

function GroupName({ groupId, initialName, onSaved, allowRename }) {
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
        className="group-name-input"
        value={name}
        maxLength={15}
        onChange={(e) => setName(e.target.value.slice(0, 15))}
        onBlur={() => {
          Route.setGroupName(groupId, name);
          setEditing(false);
          onSaved();
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            Route.setGroupName(groupId, name);
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
