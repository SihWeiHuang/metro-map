/** Shared route domain constants (import/export, kinds, limits). */

export const EXPORT_FILE_FORMAT = "metro-multiverse";
/** @deprecated legacy export still accepted on import */
export const LEGACY_EXPORT_FILE_FORMAT = "metro-map-editor";

export const ROUTE_KIND_DEFAULT = "default";
export const ROUTE_KIND_USER = "user";

export const ROUTE_STATUS_OPERATING = "operating";
export const ROUTE_STATUS_PLANNING = "planning";
export const ROUTE_STATUS_CONSTRUCTION = "construction";
export const ROUTE_STATUS_CUSTOM = "custom";

/** @deprecated legacy import format token */
export const LEGACY_IMPORT_FORMAT = "metro-map-x01";

export const PERSIST_STORAGE_KEY = "metro-map-data-v2";
export const PERSIST_VERSION = 2;
