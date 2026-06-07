let map = null;

export function setMapInstance(m) {
  map = m;
}

export function getMap() {
  return map;
}

/** True when Mapbox style is loaded and layer/source APIs are safe to call. */
export function isMapStyleReady(m = map) {
  return !!m && typeof m.isStyleLoaded === "function" && m.isStyleLoaded();
}

export function resizeMap() {
  if (!isMapStyleReady()) return;
  try {
    map.resize();
  } catch {
    /* map removed mid-resize */
  }
}
