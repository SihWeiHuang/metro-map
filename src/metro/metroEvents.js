/** Typed pub/sub replacing module-level register* callbacks. */

/** @typedef {'store:changed'|'store:persist'|'mode:changed'|'modeHint:changed'|'editStationSubmode:changed'|'mergePick:changed'|'shareView:changed'|'importUndo:changed'|'geometryRevision:bump'} MetroEventType */

/** @type {Map<MetroEventType, Set<(payload: unknown) => void>>} */
const listeners = new Map();

/**
 * @param {MetroEventType} type
 * @param {(payload: unknown) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onMetroEvent(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type)?.delete(fn);
}

/** @param {MetroEventType} type @param {unknown} [payload] */
export function emitMetroEvent(type, payload) {
  for (const fn of listeners.get(type) ?? []) {
    try {
      fn(payload);
    } catch (e) {
      console.warn(`metroEvents:${type}`, e);
    }
  }
}
