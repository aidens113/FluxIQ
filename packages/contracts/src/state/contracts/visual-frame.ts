import type { StateCoordinateSpace } from "./coordinate-space.js";
import type { StateVisualLayer } from "./visual-layer.js";
import type { StatePresentationMetadata } from "./presentation-metadata.js";
import type { JsonObject } from "../../core.js";

export type StateVisualFrame = {
  id: string;
  rendererId?: string;
  label?: string;
  coordinateSpace: StateCoordinateSpace;
  layers: StateVisualLayer[];
  presentation?: StatePresentationMetadata;
  metadata?: JsonObject;
};
