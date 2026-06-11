/**
 * Engine-neutral map types (Mapbox GL JS / MapLibre GL JS compatible subset).
 * Runtime still uses Mapbox; types decouple JSDoc from direct mapbox-gl imports.
 */

/**
 * @typedef {object} MapLike
 * @property {(type: string, listener: (...args: unknown[]) => void) => void} on
 * @property {(type: string, listener: (...args: unknown[]) => void) => void} off
 * @property {(type: string, listener: (...args: unknown[]) => void) => void} once
 * @property {() => void} resize
 * @property {() => void} remove
 * @property {() => boolean} isStyleLoaded
 * @property {() => boolean} [loaded]
 * @property {(layerId: string) => object | undefined} getLayer
 * @property {(sourceId: string) => { setData?: (data: object) => void } | undefined} getSource
 * @property {() => { layers?: object[], imports?: object[] } | undefined} getStyle
 * @property {(layerId: string, filter: unknown) => void} setFilter
 * @property {(layerId: string) => unknown} getFilter
 * @property {(layerId: string, name: string, value: unknown) => void} setLayoutProperty
 * @property {(layerId: string, name: string, value: unknown) => void} setPaintProperty
 * @property {(def: object, beforeId?: string) => void} addLayer
 * @property {(layerId: string) => void} removeLayer
 * @property {(layerId: string, beforeId?: string) => void} moveLayer
 * @property {(id: string, def: object) => void} addSource
 * @property {(id: string) => void} removeSource
 * @property {(point: object, options?: object) => object[]} queryRenderedFeatures
 * @property {(id: string) => boolean} hasImage
 * @property {(id: string, image: object, options?: object) => void} addImage
 * @property {(language: string) => void} [setLanguage]
 * @property {() => HTMLElement} getCanvas
 * @property {() => HTMLElement} getCanvasContainer
 * @property {(lngLat: LngLatLike) => PointLike} project
 * @property {(point: [number, number]) => { lng: number, lat: number }} unproject
 * @property {() => { lng: number, lat: number }} getCenter
 * @property {() => number} getZoom
 * @property {() => number} getBearing
 * @property {() => number} getPitch
 * @property {(options: object) => void} jumpTo
 * @property {(options: object) => void} flyTo
 * @property {(bounds: [[number, number], [number, number]], options?: object) => void} fitBounds
 * @property {(options: object) => void} easeTo
 * @property {(offset: [number, number], options?: object) => void} panBy
 * @property {(importId: string, key: string, value: unknown) => void} [setConfigProperty]
 * @property {{ enable?: () => void, disable?: () => void, isEnabled?: () => boolean }} [scrollZoom]
 * @property {{ enable?: () => void, disable?: () => void }} [boxZoom]
 * @property {{ enable?: () => void, disable?: () => void }} [doubleClickZoom]
 * @property {{ enable?: () => void, disable?: () => void }} [touchZoomRotate]
 * @property {{ enable?: () => void, disable?: () => void }} [keyboard]
 * @property {() => boolean} [isMoving]
 * @property {{ isActive?: () => boolean }} [dragPan]
 */

/** @typedef {[number, number] | { lng: number, lat: number }} LngLatLike */
/** @typedef {{ x: number, y: number }} PointLike */

export {};
