/**
 * Map mode interaction facade — re-exports modeBundle submodules (Phase 4).
 */
export { getMergePickSubrouteIds } from "../metro/mapInteractionBoundary.js";
export {
  M,
  Modes,
  TEMP_EDIT_LINE_HIT_LAYER,
  EDIT_STATION_SUBMODES,
  DEFAULT_EDIT_STATION_SUBMODE,
} from "./modeBundle/state.js";
export {
  pickRouteForMerge,
  pickSubRouteForSplitLine,
  setMode,
  setEditStationSubmode,
  finishEditing,
  exitEditRouteSelectMode,
  cancelMerge,
  cancelRouteEditing,
  refreshModeHint,
} from "./modeBundle/control.js";
export { popupRoute, popupStation, popupStationForEditing, clearHoverAndPopups, setCursorForMode } from "./modeBundle/hover.js";
export { initializeEventListeners } from "./modeBundle/events.js";

import "./modeBundle/handlers.js";
