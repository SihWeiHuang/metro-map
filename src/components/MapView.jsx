import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { setMapInstance, getMap } from "../map/mapInstance.js";
import {
  applyMapCameraAfterLoad,
  bindMapViewPersistence,
  consumePendingMapFit,
  getInitialMapCamera,
  snapshotMapView,
} from "../map/mapViewState.js";
import { addStationLabelFrameImage } from "../map/labelMoveFrameImage.js";
import {
  applyBasemapClutterReduction,
  initializeLayers,
  resetBasemapClutterAppliedFlag,
} from "../map/layers.js";
import { store } from "../data/metroStore.js";
import { Route } from "../map/routeModel.js";
import { initializeEventListeners } from "../map/modeBundle.js";
import { applyMapLanguage, mapOnce } from "../map-runtime/mapEngine.js";
import {
  createMap,
  createNavigationControl,
  getDefaultMapStyle,
  setMapAccessToken,
} from "../map-runtime/mapRuntime.js";
import { hideTransferSnapHint } from "../map/mapPopups.js";
import { configureScrollZoom } from "../map/mapScrollZoom.js";
import { configureMiddleButtonDragPan } from "../map/mapMiddleButtonPan.js";

const DEFAULT_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

export default function MapView() {
  const { locale } = useI18n();
  const containerRef = useRef(null);
  const lastViewRef = useRef(getInitialMapCamera());
  const mapRef = useRef(/** @type {import('../map-runtime/mapTypes.js').MapLike | null} */ (null));

  useEffect(() => {
    if (!containerRef.current) return;
    const mapLanguage = locale === "en" ? "en" : "zh-Hant";
    const view = lastViewRef.current;

    setMapAccessToken(DEFAULT_TOKEN);
    const map = createMap({
      container: containerRef.current,
      style: getDefaultMapStyle(),
      center: view.center,
      zoom: view.zoom,
      bearing: view.bearing,
      pitch: view.pitch,
      language: mapLanguage,
    });

    map.addControl(
      createNavigationControl({
        visualizePitch: true,
      }),
      "top-right",
    );

    mapRef.current = map;
    setMapInstance(map);
    const cleanupScrollZoom = configureScrollZoom(map);
    const cleanupMiddleButtonPan = configureMiddleButtonDragPan(map);

    const onStyleReady = () => {
      resetBasemapClutterAppliedFlag(map);
      applyBasemapClutterReduction(map, { force: true });
      addStationLabelFrameImage(map);
      initializeLayers(map, store);
      Route.refreshSources({ full: true });
      initializeEventListeners();
      applyMapCameraAfterLoad(map);
      consumePendingMapFit(map);
      bindMapViewPersistence(map);
    };

    if (map.isStyleLoaded()) onStyleReady();
    else mapOnce(map, "style.load", onStyleReady);

    const container = containerRef.current;
    const scheduleResize = () => {
      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          /* map removed */
        }
      });
    };
    scheduleResize();
    mapOnce(map, "load", scheduleResize);

    let resizeObserver;
    if (container && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleResize);
      resizeObserver.observe(container);
    }
    window.addEventListener("resize", scheduleResize);

    return () => {
      window.removeEventListener("resize", scheduleResize);
      resizeObserver?.disconnect();
      cleanupScrollZoom();
      cleanupMiddleButtonPan();
      const snap = snapshotMapView(map);
      if (snap) lastViewRef.current = snap;
      hideTransferSnapHint();
      mapRef.current = null;
      setMapInstance(null);
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current ?? getMap();
    if (!map) return;
    const mapLanguage = locale === "en" ? "en" : "zh-Hant";
    if (!applyMapLanguage(map, mapLanguage)) {
      /* legacy fallback: full rebuild handled only if adapter lacks setLanguage */
    }
  }, [locale]);

  return <div id="map" ref={containerRef} className="map-canvas" />;
}
