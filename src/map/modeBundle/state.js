import { getMap } from "../mapInstance.js";
import {
  findNearestTransferSnap,
  isTransferSnapOccupied,
  TRANSFER_SNAP_HOVER_METERS,
} from "../routeTransferSnap.js";
import { initMapPopups } from "../mapPopups.js";
import { STATION_DRAG_CLICK_THRESHOLD_PX } from "../transferAbsorbConfig.js";

export { STATION_DRAG_CLICK_THRESHOLD_PX };

export const M = {
  mode: "general",
  dragging: {
    type: null,
    idx: null,
    stationId: null,
    subrouteId: null,
    isClickCandidate: false,
    downPoint: null,
  },
  pointer: { isDown: false },
  hover: { subrouteId: "", stationId: "", transferSnapId: "", passingKey: "" },
  suppressNextEditMapClick: false,
};

export const Modes = {};

export const TRANSFER_SNAP_HINT_DEPS = {
  findNearest: findNearestTransferSnap,
  isOccupied: isTransferSnapOccupied,
  maxMeters: TRANSFER_SNAP_HOVER_METERS,
};

export const TEMP_EDIT_LINE_HIT_LAYER = "temp-edit-line-hit-layer";

export const STATION_CIRCLE_LAYERS = ["stations-circle", "transfer-stations-circle"];
export const STATION_HOVER_CIRCLE_LAYERS = ["stations-circle-hover", "transfer-stations-circle-hover"];
export const STATION_LABEL_LAYERS = ["stations-label", "stations-label-hover"];
export const HOVER_PICK_LAYERS = [
  "transfer-snaps-layer",
  "transfer-absorb-zones-hover-layer",
  "transfer-absorb-zones-hover-outline-layer",
  "transfer-absorb-zones-layer",
  "transfer-absorb-zones-outline-layer",
  ...STATION_HOVER_CIRCLE_LAYERS,
  ...STATION_CIRCLE_LAYERS,
  ...STATION_LABEL_LAYERS,
  "routes-line",
];

export const LABEL_DRAG_RADIUS_METERS = 500;

export const EDIT_STATION_SUBMODES = ["crud", "move-label"];
export const DEFAULT_EDIT_STATION_SUBMODE = "crud";

let editStationSubmode = DEFAULT_EDIT_STATION_SUBMODE;

export function getEditStationSubmode() {
  return normalizeEditStationSubmode(editStationSubmode);
}

export function setEditStationSubmodeLocal(next) {
  editStationSubmode = next;
}

export function normalizeEditStationSubmode(next) {
  if (next === "station" || next === "move-station" || next === "add-transfer") return "crud";
  return next;
}

export function isEditStationSubmode(next) {
  return EDIT_STATION_SUBMODES.includes(normalizeEditStationSubmode(next));
}

export const cur = () => Modes[M.mode];

initMapPopups({
  getMap,
  getContext: () => ({
    mode: M.mode,
    editStationSubmode: normalizeEditStationSubmode(editStationSubmode),
    draggingType: M.dragging.type,
  }),
});
