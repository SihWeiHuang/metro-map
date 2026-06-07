import { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import {
  GEO_COUNTRY_OTHER,
  GEO_REGION_OTHER,
  canonicalizeCountryId,
  canonicalizeRegion,
} from "../map/geoCatalog.js";
import { loadLastRouteGeo, saveLastRouteGeo } from "../map/lastRouteGeoPrefs.js";
import { Route } from "../map/routeModel.js";
import { formatRegionLabel } from "./routeListGeoNav.js";

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

/** 尚未選擇國家（僅新路線流程） */
const SELECT_UNSET = "__unset__";
/** 下拉選「自訂輸入」 */
const SELECT_CUSTOM = "__custom__";

function countryOptionLabel(countryId, t) {
  const labelKey = Route.getCountryLabelKey(countryId);
  if (labelKey) return t(labelKey);
  if (countryId === GEO_COUNTRY_OTHER) return t("geo.otherCountry");
  return countryId;
}

function regionOptionLabel(regionId, t) {
  return formatRegionLabel(regionId, t);
}

function resolveCountryValue(selectValue, customText) {
  if (selectValue === SELECT_UNSET) return GEO_COUNTRY_OTHER;
  if (selectValue === SELECT_CUSTOM) return canonicalizeCountryId(customText);
  return canonicalizeCountryId(selectValue);
}

function resolveRegionValue(selectValue, customText) {
  if (selectValue === SELECT_CUSTOM) return canonicalizeRegion(customText);
  return canonicalizeRegion(selectValue);
}

function buildInitialCountrySelect(countryId, countryOptions) {
  if (countryOptions.some((o) => o.countryId === countryId)) {
    return { select: countryId, custom: "" };
  }
  if (countryId === GEO_COUNTRY_OTHER) {
    return { select: GEO_COUNTRY_OTHER, custom: "" };
  }
  return { select: SELECT_CUSTOM, custom: countryId };
}

function buildInitialRegionSelect(regionId, regionOptions) {
  if (regionOptions.some((o) => o.regionId === regionId)) {
    return { select: regionId, custom: "" };
  }
  if (regionId === GEO_REGION_OTHER) {
    return { select: GEO_REGION_OTHER, custom: "" };
  }
  return { select: SELECT_CUSTOM, custom: regionId };
}

export default function RouteStatusDialog({
  routeIds,
  isNewRoute = false,
  suppressAutoOpen = false,
  onSuppressAutoOpenChange,
  onClose,
  onSaved,
}) {
  const { t } = useI18n();
  const primaryRouteId = routeIds?.[0];
  const initialStatus = primaryRouteId ? Route.getRouteStatus(primaryRouteId) : Route.ROUTE_STATUS_CUSTOM;
  const routeGeo = primaryRouteId ? Route.getRouteGeo(primaryRouteId) : { country: GEO_COUNTRY_OTHER, region: GEO_REGION_OTHER };
  const lastGeo = useMemo(() => loadLastRouteGeo(), []);
  const presetGeo = isNewRoute && lastGeo ? lastGeo : routeGeo;
  const showCountryPlaceholder = isNewRoute && !lastGeo;

  const countryOptions = useMemo(() => Route.getRouteGeoCountryOptions(), []);
  const initialCountry = useMemo(
    () =>
      showCountryPlaceholder
        ? { select: SELECT_UNSET, custom: "" }
        : buildInitialCountrySelect(presetGeo.country, countryOptions),
    [showCountryPlaceholder, presetGeo.country, countryOptions],
  );

  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [countrySelect, setCountrySelect] = useState(initialCountry.select);
  const [customCountry, setCustomCountry] = useState(initialCountry.custom);
  const [regionSelect, setRegionSelect] = useState(() => {
    if (initialCountry.select === SELECT_UNSET) return GEO_REGION_OTHER;
    const resolvedCountry = resolveCountryValue(initialCountry.select, initialCountry.custom);
    const cities = Route.getRouteGeoCityOptions(resolvedCountry);
    return buildInitialRegionSelect(presetGeo.region, cities).select;
  });
  const [customRegion, setCustomRegion] = useState(() => {
    if (initialCountry.select === SELECT_UNSET) return "";
    const resolvedCountry = resolveCountryValue(initialCountry.select, initialCountry.custom);
    const cities = Route.getRouteGeoCityOptions(resolvedCountry);
    return buildInitialRegionSelect(presetGeo.region, cities).custom;
  });

  const countryChosen = countrySelect !== SELECT_UNSET;
  const resolvedCountry = countryChosen ? resolveCountryValue(countrySelect, customCountry) : GEO_COUNTRY_OTHER;

  const cityOptions = useMemo(
    () => (countryChosen ? Route.getRouteGeoCityOptions(resolvedCountry) : []),
    [countryChosen, resolvedCountry],
  );

  const handleCountryChange = (next) => {
    setCountrySelect(next);
    if (next === SELECT_CUSTOM) {
      setCustomCountry("");
    }
    setRegionSelect(GEO_REGION_OTHER);
    setCustomRegion("");
  };

  const save = () => {
    const country = resolveCountryValue(countrySelect, customCountry);
    const region = countryChosen ? resolveRegionValue(regionSelect, customRegion) : GEO_REGION_OTHER;
    for (const routeId of routeIds) {
      Route.setRouteMetadata(routeId, { status: selectedStatus, country, region });
    }
    saveLastRouteGeo(country, region);
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
          {t(isNewRoute ? "routeStatus.dialogTitleNew" : "routeStatus.dialogTitle")}
        </h2>

        <label className="app-route-status-select-field" htmlFor="route-country-select">
          <span className="app-route-status-select-label">{t("routeStatus.countryLabel")}</span>
          <select
            id="route-country-select"
            className="app-route-status-select"
            value={countrySelect}
            onChange={(e) => handleCountryChange(e.target.value)}
          >
            {showCountryPlaceholder ? (
              <option value={SELECT_UNSET} disabled>
                {t("routeStatus.countryPlaceholder")}
              </option>
            ) : null}
            {countryOptions.map((opt) => (
              <option key={opt.countryId || "__other__"} value={opt.countryId}>
                {countryOptionLabel(opt.countryId, t)}
              </option>
            ))}
            <option value={SELECT_CUSTOM}>{t("routeStatus.customOption")}</option>
          </select>
          {countrySelect === SELECT_CUSTOM ? (
            <input
              type="text"
              className="app-route-status-text-input"
              value={customCountry}
              onChange={(e) => setCustomCountry(e.target.value)}
              placeholder={t("routeStatus.customCountryPlaceholder")}
              maxLength={30}
            />
          ) : null}
        </label>

        <label className="app-route-status-select-field" htmlFor="route-region-select">
          <span className="app-route-status-select-label">{t("routeStatus.cityLabel")}</span>
          <select
            id="route-region-select"
            className="app-route-status-select"
            value={regionSelect}
            disabled={!countryChosen}
            onChange={(e) => {
              setRegionSelect(e.target.value);
              if (e.target.value !== SELECT_CUSTOM) setCustomRegion("");
            }}
          >
            {!countryChosen ? (
              <option value={GEO_REGION_OTHER}>{t("routeStatus.cityDisabledHint")}</option>
            ) : (
              cityOptions.map((opt) => (
                <option key={opt.regionId || "__other__"} value={opt.regionId}>
                  {regionOptionLabel(opt.regionId, t)}
                </option>
              ))
            )}
            {countryChosen ? <option value={SELECT_CUSTOM}>{t("routeStatus.customOption")}</option> : null}
          </select>
          {countryChosen && regionSelect === SELECT_CUSTOM ? (
            <input
              type="text"
              className="app-route-status-text-input"
              value={customRegion}
              onChange={(e) => setCustomRegion(e.target.value)}
              placeholder={t("routeStatus.customCityPlaceholder")}
              maxLength={30}
            />
          ) : null}
        </label>

        <label className="app-route-status-select-field" htmlFor="route-status-select">
          <span className="app-route-status-select-label">{t("routeStatus.dialogHint")}</span>
          <select
            id="route-status-select"
            className="app-route-status-select"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {t(STATUS_LABEL_KEYS[status])}
              </option>
            ))}
          </select>
        </label>

        {isNewRoute ? (
          <label className="app-route-status-checkbox-field">
            <input
              type="checkbox"
              checked={suppressAutoOpen}
              onChange={(e) => onSuppressAutoOpenChange?.(e.target.checked)}
            />
            <span>{t("routeStatus.doNotShowForNewRoutes")}</span>
          </label>
        ) : null}

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
