import { cancelMerge, setEditStationSubmode, setMode } from "../map/modeController.js";

export default function AppEditToolsPanel({
  t,
  editToolsOpen,
  toggleEditTools,
  editModeToggleLocked,
  shareViewActive,
  toolsDisabled,
  modeBtnDisabled,
  mode,
  isEditRouteMode,
  showMergeCancel,
  showEditStationSubmodeButtons,
  editStationSubmode,
  openFileMenu,
  tryStartAddRoute,
}) {
  return (
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
              <div className="edit-station-submode-panel" role="group" aria-label={t("app.modeEditStation")}>
                <div className="edit-station-submode-panel__grid">
                  {["crud", "move-station", "move-label", "add-transfer"].map((submode) => (
                    <button
                      key={submode}
                      type="button"
                      disabled={toolsDisabled}
                      className={`edit-station-submode-btn${editStationSubmode === submode ? " is-active" : ""}`}
                      onClick={() => setEditStationSubmode(submode)}
                    >
                      {t(
                        submode === "crud"
                          ? "app.submodeCrud"
                          : submode === "move-station"
                            ? "app.submodeMoveStation"
                            : submode === "move-label"
                              ? "app.submodeMoveLabel"
                              : "app.submodeAddTransfer",
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
