import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { scheduleGeoCityMapView } from "../map/geoMapView.js";
import { canonicalizeCountryId, canonicalizeRegion } from "../map/geoCatalog.js";
import { loadRouteListNav, saveRouteListNav } from "../map/routeListNavPrefs.js";
import { Route } from "../map/routeModel.js";
import RouteListPanel from "./RouteListPanel.jsx";
import {
  buildCityNavEntries,
  buildCountryNavEntries,
  filterRoutesForGeo,
  formatCountryLabel,
  formatRegionLabel,
  sanitizeRouteListNavSelection,
} from "./routeListGeoNav.js";

/** @typedef {"country" | "city" | "routes"} NavLevel */

function GeoNavList({ items, getLabel, onPick, countLabel }) {
  return (
    <div className="route-geo-nav-list" role="list">
      {items.map((item) => {
        const id = item.countryId ?? item.regionId ?? "";
        const key = id || "__other__";
        const count = item.routeCount ?? 0;
        return (
          <button
            key={key}
            type="button"
            className="route-geo-nav-row"
            role="listitem"
            onClick={() => onPick(item)}
          >
            <span className="route-geo-nav-label">{getLabel(item)}</span>
            <span className="route-geo-nav-meta">{countLabel(count)}</span>
            <span className="route-geo-nav-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function RouteListNavigator({
  listRevision = 0,
  onRefresh,
  geoFocus = null,
  onGeoFocusHandled,
  showRouteActions = false,
  mergeSelectMode = false,
  splitLineSelectMode = false,
  onEditRouteMetadata,
}) {
  const { t } = useI18n();
  const routeList = useMemo(() => Route.getRouteList(), [listRevision]);

  const [level, setLevel] = useState(() => loadRouteListNav()?.level ?? "country");
  const [selectedCountryId, setSelectedCountryId] = useState(() => loadRouteListNav()?.countryId ?? "");
  const [selectedRegionId, setSelectedRegionId] = useState(() => loadRouteListNav()?.regionId ?? "");

  useEffect(() => {
    if (!geoFocus) return;
    const next = sanitizeRouteListNavSelection(
      "routes",
      canonicalizeCountryId(geoFocus.country),
      canonicalizeRegion(geoFocus.region),
    );
    setLevel(next.level);
    setSelectedCountryId(next.countryId);
    setSelectedRegionId(next.regionId);
    onGeoFocusHandled?.();
  }, [geoFocus, onGeoFocusHandled]);

  useEffect(() => {
    const next = sanitizeRouteListNavSelection(level, selectedCountryId, selectedRegionId);
    if (
      next.level !== level ||
      next.countryId !== selectedCountryId ||
      next.regionId !== selectedRegionId
    ) {
      setLevel(next.level);
      setSelectedCountryId(next.countryId);
      setSelectedRegionId(next.regionId);
      return;
    }
    saveRouteListNav({ level, countryId: selectedCountryId, regionId: selectedRegionId });
  }, [level, selectedCountryId, selectedRegionId]);

  /** 進入路線層（已選定城市）時移動地圖；國家層／城市列表層不移動 */
  useEffect(() => {
    if (level !== "routes") return;
    scheduleGeoCityMapView(selectedCountryId, selectedRegionId);
  }, [level, selectedCountryId, selectedRegionId]);

  const countryEntries = useMemo(() => buildCountryNavEntries(routeList), [routeList]);
  const cityEntries = useMemo(
    () => (level === "city" || level === "routes" ? buildCityNavEntries(routeList, selectedCountryId) : []),
    [level, routeList, selectedCountryId],
  );

  const filteredRoutes = useMemo(() => {
    if (level !== "routes") return [];
    return filterRoutesForGeo(routeList, selectedCountryId, selectedRegionId);
  }, [level, routeList, selectedCountryId, selectedRegionId]);

  const countryLabel = formatCountryLabel(selectedCountryId, t);
  const regionLabel = formatRegionLabel(selectedRegionId, t);

  const routeCountSubtitle = t("app.routeListTitle", {
    current: Route.countUserRoutes(),
    limit: Route.getMaxUserRoutes(),
  });

  const goBack = () => {
    if (level === "routes") {
      setLevel("city");
      return;
    }
    if (level === "city") {
      setLevel("country");
      setSelectedRegionId("");
    }
  };

  const goToCountry = () => {
    setLevel("country");
    setSelectedRegionId("");
  };

  const pickCountry = (item) => {
    setSelectedCountryId(canonicalizeCountryId(item.countryId));
    setSelectedRegionId("");
    setLevel("city");
  };

  const pickCity = (item) => {
    setSelectedRegionId(canonicalizeRegion(item.regionId));
    setLevel("routes");
  };

  const showModeNavHint = (mergeSelectMode || splitLineSelectMode) && level !== "routes";
  const routeLayerEditActions = level === "routes" && showRouteActions;
  const routeLayerMerge = level === "routes" && mergeSelectMode;
  const routeLayerSplit = level === "routes" && splitLineSelectMode;
  const pickerHeaderClass = level === "country" || level === "city" ? " route-list-nav-header--picker" : "";

  return (
    <>
      <div className={`app-side-panel-header route-list-nav-header${pickerHeaderClass}`}>
        <div className="route-list-nav-path-row">
          <nav className="route-list-nav-path route-list-nav-path--stacked" aria-label={t("routeList.breadcrumbAria")}>
            <div className="route-list-nav-crumb-line route-list-nav-crumb-line--primary">
              {level === "country" ? (
                <span className="route-list-nav-crumb-spacer" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  className="route-list-nav-chevron-back"
                  onClick={goBack}
                  aria-label={t("routeList.navBack")}
                >
                  <span className="route-list-nav-chevron" aria-hidden="true">
                    ‹
                  </span>
                </button>
              )}
              {level === "country" ? (
                <span className="route-list-nav-pill route-list-nav-pill--current">
                  {t("routeList.navTitleCountries")}
                </span>
              ) : level === "city" ? (
                <button
                  type="button"
                  className="route-list-nav-pill route-list-nav-pill--link"
                  onClick={goToCountry}
                  aria-label={t("routeList.navTitleCountries")}
                >
                  {t("routeList.navTitleCountries")}
                </button>
              ) : (
                <button
                  type="button"
                  className="route-list-nav-pill route-list-nav-pill--link"
                  onClick={() => setLevel("city")}
                  aria-label={t("routeList.navBackToCity", { country: countryLabel })}
                >
                  {countryLabel}
                </button>
              )}
              <span className="route-list-nav-chevron route-list-nav-chevron--sep" aria-hidden="true">
                ›
              </span>
              {level === "country" ? (
                <span className="route-list-nav-pill route-list-nav-pill--pending">
                  {t("routeList.navTitleCities")}
                </span>
              ) : level === "city" ? (
                <span className="route-list-nav-pill route-list-nav-pill--current">
                  {t("routeList.navTitleCities")}
                </span>
              ) : (
                <span className="route-list-nav-pill route-list-nav-pill--current">{regionLabel}</span>
              )}
            </div>
            <div className="route-list-nav-crumb-line route-list-nav-crumb-line--secondary">
              <span className="route-list-nav-chevron route-list-nav-chevron--sep" aria-hidden="true">
                ›
              </span>
              <span className="route-list-nav-route-end" title={routeCountSubtitle}>
                {routeCountSubtitle}
              </span>
            </div>
          </nav>
        </div>
      </div>

      <div className="app-side-panel-content route-list-sidebar-scroll">
        {showModeNavHint ? (
          <p className="route-list-nav-mode-hint" role="status">
            {mergeSelectMode ? t("routeList.navMergeHint") : t("routeList.navSplitHint")}
          </p>
        ) : null}

        {level === "country" ? (
          <GeoNavList
            items={countryEntries}
            getLabel={(item) => formatCountryLabel(item.countryId, t)}
            onPick={pickCountry}
            countLabel={(n) => t("routeList.navRouteCount", { n })}
          />
        ) : null}

        {level === "city" ? (
          <GeoNavList
            items={cityEntries}
            getLabel={(item) => formatRegionLabel(item.regionId, t)}
            onPick={pickCity}
            countLabel={(n) => t("routeList.navRouteCount", { n })}
          />
        ) : null}

        {level === "routes" ? (
          filteredRoutes.length > 0 ? (
            <RouteListPanel
              routes={filteredRoutes}
              onRefresh={onRefresh}
              showRouteActions={routeLayerEditActions}
              mergeSelectMode={routeLayerMerge}
              splitLineSelectMode={routeLayerSplit}
              onEditRouteMetadata={onEditRouteMetadata}
            />
          ) : (
            <p className="route-list-geo-empty">{t("routeList.navEmptyCity")}</p>
          )
        ) : null}
      </div>
    </>
  );
}
