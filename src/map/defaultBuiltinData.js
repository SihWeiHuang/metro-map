/**
 * Built-in default map data (shared for all users).
 *
 * Fill this file with your official/default routes and stations.
 * - subroutesFC.features[*].properties.route_kind should be "default"
 * - users' local route edits are stored separately in localStorage
 */
export const DEFAULT_BUILTIN_MAP_DATA = {
  subroutesFC: {
    type: "FeatureCollection",
    features: [],
  },
  stationsFC: {
    type: "FeatureCollection",
    features: [],
  },
};

