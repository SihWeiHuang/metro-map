import defaultRoutesData from "../default-routes/taipei-mrt-import-fitted.json";

/**
 * Built-in default map data (shared for all users).
 *
 * Default route files live in `src/default-routes/`.
 * - subroutesFC.features[*].properties.route_kind is normalized to "default" on load
 * - users' local route edits are stored separately in localStorage
 */
export const DEFAULT_BUILTIN_MAP_DATA = {
  subroutesFC: defaultRoutesData.userSubroutesFC ?? { type: "FeatureCollection", features: [] },
  stationsFC: defaultRoutesData.userStationsFC ?? { type: "FeatureCollection", features: [] },
};

