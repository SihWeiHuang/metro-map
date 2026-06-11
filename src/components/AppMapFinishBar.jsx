export default function AppMapFinishBar({
  t,
  showFinish,
  editToolsOpen,
  showEditRouteActiveCommitActions,
  showEditRouteSelectEndAction,
  showAddRouteCommitActions,
  activeEditRouteId,
  shareViewActive,
  onFinishEditing,
  onCancelRouteEditing,
  onExitEditRouteSelect,
  onDeleteActiveRouteOnMap,
}) {
  if (!showFinish || !editToolsOpen) return null;

  const slotClass =
    showEditRouteActiveCommitActions && activeEditRouteId && !shareViewActive
      ? " app-map-finish-slot--triple"
      : showEditRouteActiveCommitActions || showAddRouteCommitActions
        ? " app-map-finish-slot--pair"
        : "";

  return (
    <div className={`app-map-finish-slot${slotClass}`}>
      {showEditRouteActiveCommitActions ? (
        <>
          <button type="button" id="cancelRouteEditButton" className="mode-cancel-bar" onClick={onCancelRouteEditing}>
            {t("app.cancelRouteEdit")}
          </button>
          {activeEditRouteId && !shareViewActive ? (
            <button
              type="button"
              id="deleteRouteOnMapButton"
              className="mode-delete-route-bar"
              title={t("app.deleteRouteOnMapTitle")}
              onClick={onDeleteActiveRouteOnMap}
            >
              {t("app.deleteRouteOnMap")}
            </button>
          ) : null}
          <button type="button" id="finishRouteEditButton" className="mode-finish-bar" onClick={onFinishEditing}>
            {t("app.finishRouteEdit")}
          </button>
        </>
      ) : showEditRouteSelectEndAction ? (
        <button type="button" id="endEditRouteButton" className="mode-finish-bar" onClick={onExitEditRouteSelect}>
          {t("app.endEditRoute")}
        </button>
      ) : showAddRouteCommitActions ? (
        <>
          <button type="button" id="cancelModeButton" className="mode-cancel-bar" onClick={onCancelRouteEditing}>
            {t("app.cancel")}
          </button>
          <button type="button" id="finishModeButton" className="mode-finish-bar" onClick={onFinishEditing}>
            {t("app.finish")}
          </button>
        </>
      ) : (
        <button type="button" id="finishModeButton" className="mode-finish-bar" onClick={onFinishEditing}>
          {t("app.finish")}
        </button>
      )}
    </div>
  );
}
