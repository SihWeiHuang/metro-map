export default function AppFileMenuDialog({
  t,
  open,
  importUndoAvailable,
  onClose,
  onShare,
  onExport,
  onImport,
  onUndo,
  onReset,
}) {
  if (!open) return null;

  return (
    <div className="app-import-dialog-backdrop" role="presentation" onClick={onClose}>
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
          <button type="button" className="app-file-menu-btn app-file-menu-btn--primary" onClick={onShare} title={t("share.menuTitle")}>
            {t("share.menuLabel")}
          </button>
          <button type="button" className="app-file-menu-btn" onClick={onExport} title={t("app.exportRoutesTitle")}>
            {t("app.exportRoutes")}
          </button>
          <button type="button" className="app-file-menu-btn" onClick={onImport} title={t("app.importMapTitle")}>
            {t("app.importMap")}
          </button>
          <button
            type="button"
            className="app-file-menu-btn"
            disabled={!importUndoAvailable}
            onClick={onUndo}
            title={t("app.undoLastImportTitle")}
          >
            {t("app.undoLastImport")}
          </button>
          <button
            type="button"
            className="app-file-menu-btn app-file-menu-btn--danger"
            onClick={onReset}
            title={t("app.resetToDefaultTitle")}
          >
            {t("app.resetToDefault")}
          </button>
        </div>
        <div className="app-import-dialog-actions">
          <button type="button" className="app-import-dialog-btn app-import-dialog-btn--cancel" onClick={onClose}>
            {t("app.importCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
