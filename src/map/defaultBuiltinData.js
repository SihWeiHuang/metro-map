import defaultRoutesData from "../default-routes/taipei-mrt-import-fitted.json";
import { DEFAULT_MAP_VIEW } from "./defaultMapViewConstants.js";
import { computeBoundsFromFeatures } from "./mapGeoBounds.js";

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

/** fitBounds 時留邊；maxZoom 避免預設視野過近。 */
export const DEFAULT_METRO_MAP_FIT = {
  padding: 52,
  maxZoom: 12.5,
};

const subroutesForBounds = () => DEFAULT_BUILTIN_MAP_DATA.subroutesFC?.features ?? [];
const stationsForBounds = () => DEFAULT_BUILTIN_MAP_DATA.stationsFC?.features ?? [];

/** 涵蓋雙北捷運預設路網的鏡頭（與全站 DEFAULT_MAP_VIEW 相同定值）。 */
export const DEFAULT_BUILTIN_MAP_VIEW = {
  ...DEFAULT_MAP_VIEW,
  bounds: computeBoundsFromFeatures(subroutesForBounds(), stationsForBounds()),
};

