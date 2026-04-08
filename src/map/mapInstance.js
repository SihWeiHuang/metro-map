let map = null;

export function setMapInstance(m) {
  map = m;
}

export function getMap() {
  return map;
}

export function resizeMap() {
  if (map) map.resize();
}
