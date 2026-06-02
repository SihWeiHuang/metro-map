import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { setMapInstance } from "../map/mapInstance.js";
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
import { Route, store } from "../map/routeModel.js";
import { initializeEventListeners, registerModeChange } from "../map/modeBundle.js";
import { configureScrollZoom } from "../map/mapScrollZoom.js";
import { configureMiddleButtonDragPan } from "../map/mapMiddleButtonPan.js";

const DEFAULT_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

export default function MapView({ onModeChange }) {
  const { locale } = useI18n();
  const containerRef = useRef(null);
  const lastViewRef = useRef(getInitialMapCamera());

  useEffect(() => {
    registerModeChange(onModeChange);
  }, [onModeChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const mapLanguage = locale === "en" ? "en" : "zh-Hant";
    const view = lastViewRef.current;

    mapboxgl.accessToken = DEFAULT_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/ethen9798/cmfceirln001n01sl9bqf4axy",
      center: view.center,
      zoom: view.zoom,
      bearing: view.bearing,
      pitch: view.pitch,
      language: mapLanguage,
    });

    map.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
      }),
      "top-right"
    );

    setMapInstance(map);
    const cleanupScrollZoom = configureScrollZoom(map);
    const cleanupMiddleButtonPan = configureMiddleButtonDragPan(map);

    const onStyleReady = () => {
      resetBasemapClutterAppliedFlag(map);
      applyBasemapClutterReduction(map, { force: true });
      addStationLabelFrameImage(map);
      initializeLayers(map, store);
      Route.refreshSources();
      initializeEventListeners();
      applyMapCameraAfterLoad(map);
      consumePendingMapFit(map);
      bindMapViewPersistence(map);
    };

    if (map.isStyleLoaded()) onStyleReady();
    else map.once("style.load", onStyleReady);

    return () => {
      cleanupScrollZoom();
      cleanupMiddleButtonPan();
      const snap = snapshotMapView(map);
      if (snap) lastViewRef.current = snap;
      setMapInstance(null);
      map.remove();
    };
  }, [locale]);

  return <div id="map" ref={containerRef} className="map-canvas" />;
}
