import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { Route } from "../map/routeModel.js";

const STATUS_OPTIONS = [
  Route.ROUTE_STATUS_OPERATING,
  Route.ROUTE_STATUS_PLANNING,
  Route.ROUTE_STATUS_CONSTRUCTION,
  Route.ROUTE_STATUS_CUSTOM,
];

const STATUS_LABEL_KEYS = {
  [Route.ROUTE_STATUS_OPERATING]: "routeStatus.operating",
  [Route.ROUTE_STATUS_PLANNING]: "routeStatus.planning",
  [Route.ROUTE_STATUS_CONSTRUCTION]: "routeStatus.construction",
  [Route.ROUTE_STATUS_CUSTOM]: "routeStatus.custom",
};

export default function RouteStatusDialog({ groupIds, isNewRoute = false, onClose, onSaved }) {
  const { t } = useI18n();
  const primaryGroupId = groupIds?.[0];
  const initialStatus = primaryGroupId ? Route.getGroupStatus(primaryGroupId) : Route.ROUTE_STATUS_CUSTOM;
  const [selected, setSelected] = useState(initialStatus);

  const save = () => {
    for (const gid of groupIds) {
      Route.setGroupStatus(gid, selected);
    }
    onSaved?.();
    onClose();
  };

  return (
    <div className="app-import-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="app-import-dialog app-route-status-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-status-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="route-status-dialog-title" className="app-import-dialog-title">
          {isNewRoute ? t("routeStatus.dialogTitleNew") : t("routeStatus.dialogTitle")}
        </h2>
        <label className="app-route-status-select-field" htmlFor="route-status-select">
          <span className="app-route-status-select-label">{t("routeStatus.dialogHint")}</span>
          <select
            id="route-status-select"
            className="app-route-status-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {t(STATUS_LABEL_KEYS[status])}
              </option>
            ))}
          </select>
        </label>
        <div className="app-import-dialog-actions app-route-status-actions">
          <button type="button" className="app-import-dialog-btn app-import-dialog-btn--cancel" onClick={onClose}>
            {t("app.importCancel")}
          </button>
          <button type="button" className="app-import-dialog-btn app-import-dialog-btn--merge" onClick={save}>
            {t("routeStatus.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
