import { useMetroMapInteraction } from "./mapInteractionBoundary.js";
import { useMetroMapMode } from "./mapModeBoundary.js";

export function useEditMode() {
  const mode = useMetroMapMode();
  const { modeHint, editStationSubmode } = useMetroMapInteraction();
  return { mode, modeHint, editStationSubmode };
}
