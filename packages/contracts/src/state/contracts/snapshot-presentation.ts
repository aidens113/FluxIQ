import type { StateVisualFrame } from "./visual-frame.js";
import type { JsonObject } from "../../core.js";

export type StateSnapshotPresentation = {
  visualFrames?: StateVisualFrame[];
  defaultFrameId?: string;
  metadata?: JsonObject;
};
