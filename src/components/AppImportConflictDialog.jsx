export default function AppImportConflictDialog({ t, pendingImport, onClose, onConfirm }) {
  if (pendingImport == null) return null;

  return (
    <div className="app-import-dialog-backdrop" role="presentation" onClick={onClose}>
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
          <button type="button" className="app-import-option" onClick={() => onConfirm("merge")}>
            <span className="app-import-option-label">{t("app.importMergeDirect")}</span>
            <span className="app-import-option-hint">{t("app.importMergeDirectHint")}</span>
          </button>
          <button type="button" className="app-import-option" onClick={() => onConfirm("replaceMatching")}>
            <span className="app-import-option-label">{t("app.importReplaceMatching")}</span>
            <span className="app-import-option-hint">{t("app.importReplaceMatchingHint")}</span>
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
