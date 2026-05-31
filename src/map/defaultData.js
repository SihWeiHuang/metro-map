import taipeiMrtImportFitted from "../../default-data/taipei-mrt-import-fitted.json";

/**
 * Built-in default map data (shared for all users).
 *
 * Default route JSON files live in `default-data/` at the project root.
 * Add new default datasets to that folder and export them here.
 *
 * - subroutesFC.features[*].properties.route_kind is normalized to "default" on load
 * - users' local route edits are stored separately in localStorage
 */
export const DEFAULT_BUILTIN_MAP_DATA = {
  subroutesFC: taipeiMrtImportFitted.userSubroutesFC ?? { type: "FeatureCollection", features: [] },
  stationsFC: taipeiMrtImportFitted.userStationsFC ?? { type: "FeatureCollection", features: [] },
};
