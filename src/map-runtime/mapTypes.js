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
 */

/** @typedef {[number, number]} LngLatLike */
/** @typedef {{ x: number, y: number }} PointLike */

export {};
