import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { Route } from "../map/routeModel.js";
import { setMode } from "../map/modeBundle.js";
import {
  buildRouteListGridTemplate,
  defaultRouteListColumns,
} from "./routeListColumnPrefs.js";

export default function RouteListPanel({ onRefresh, showRouteActions = false }) {
  const { t } = useI18n();
  const groupList = Route.getGroupList();
  const [selectedGroupIds, setSelectedGroupIds] = useState(() => new Set());
  const [columnVisibility] = useState(defaultRouteListColumns);

  const gridTemplateColumns = useMemo(
    () => buildRouteListGridTemplate(showRouteActions, columnVisibility),
    [showRouteActions, columnVisibility],
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

  const allSelected = groupList.length > 0 && selectedGroupIds.size === groupList.length;
  const selectedCount = selectedGroupIds.size;
  const activeEditGroupId = showRouteActions ? Route.getActiveEditGroupId() : null;
  const toolbarLocked = !!activeEditGroupId;

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

  return (
    <div className="route-list-inner">
      {showRouteActions && (
        <div className="route-batch-toolbar">
          <label className="route-select-all">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={toolbarLocked} />
            {t("routeList.selectAll")}
          </label>
          <span className="route-selected-count">{t("routeList.selected", { n: selectedCount })}</span>
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
        {columnVisibility.kind && (
          <div className="route-list-header-tags">
            <span className="route-list-header-label">{t("routeList.colKind")}</span>
          </div>
        )}
        {showRouteActions && columnVisibility.actions && (
          <div className="group-row-trailing route-list-header-trailing">
            <span className="route-list-header-label">{t("routeList.colActions")}</span>
          </div>
        )}
      </div>
      {visibleGroupList.map((g) => {
        const currentName = g.routes[0]?.name || t("routeList.groupFallback", { id: g.group_id });
        return (
          <GroupRow
            key={g.group_id}
            g={g}
            currentName={currentName}
            onRefresh={onRefresh}
            selected={selectedGroupIds.has(g.group_id)}
            onToggleSelect={() => toggleGroupSelect(g.group_id)}
            showRouteActions={showRouteActions}
            activeEditGroupId={activeEditGroupId}
            cols={columnVisibility}
            gridStyle={gridStyle}
            t={t}
          />
        );
      })}
    </div>
  );
}

function GroupRow({ g, currentName, onRefresh, selected, onToggleSelect, showRouteActions, activeEditGroupId, cols, gridStyle, t }) {
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
    if (!showRouteActions || disableRowActions) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "B") return;
    Route.clearHover();
    Route.startEditGroup(g.group_id);
  };

  const endMouseUp = (e) => {
    if (!showRouteActions || disableRowActions) return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "B") return;
    setMode("edit-route-active");
  };

  const rowClass =
    `group-header route-item route-list-row-grid${showRouteActions ? "" : " route-item-readonly"}${isActiveEditingRow ? " route-item-active-edit" : ""}${isLockedByOtherRow ? " route-item-disabled" : ""}`;

  const kindBadge = (
    <span
      className={`route-kind-badge route-kind-${g.route_kind === Route.ROUTE_KIND_DEFAULT ? "default" : "user"}`}
      title={t("routeList.kindBadgeTitle")}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {g.route_kind === Route.ROUTE_KIND_DEFAULT ? t("routeList.kindDefault") : t("routeList.kindUser")}
    </span>
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
      onMouseDown={showRouteActions ? startEdit : undefined}
      onMouseUp={showRouteActions ? endMouseUp : undefined}
    >
      <div className="route-row-lead">
        {showRouteActions ? (
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
      {cols.kind && <div className="route-row-tags-col">{kindBadge}</div>}
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
