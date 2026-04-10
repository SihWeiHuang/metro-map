import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { setMapInstance } from "../map/mapInstance.js";
import { addStationLabelFrameImage } from "../map/labelMoveFrameImage.js";
import { initializeLayers } from "../map/layers.js";
import { Route, store } from "../map/routeModel.js";
import { initializeEventListeners, registerModeChange } from "../map/modeBundle.js";

const DEFAULT_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

export default function MapView({ onModeChange }) {
  const { locale } = useI18n();
  const containerRef = useRef(null);

  useEffect(() => {
    registerModeChange(onModeChange);
  }, [onModeChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const mapLanguage = locale === "en" ? "en" : "zh-Hant";

    mapboxgl.accessToken = DEFAULT_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/ethen9798/cmfceirln001n01sl9bqf4axy",
      center: [121.51, 25.03],
      zoom: 14,
      language: mapLanguage,
    });

    map.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
      }),
      "top-right"
    );

    setMapInstance(map);

    const onLoad = () => {
      addStationLabelFrameImage(map);
      initializeLayers(map, store);
      Route.refreshSources();
      initializeEventListeners();
    };

    if (map.loaded()) onLoad();
    else map.once("load", onLoad);

    return () => {
      setMapInstance(null);
      map.remove();
    };
  }, [locale]);

  return <div id="map" ref={containerRef} className="map-canvas" />;
}
