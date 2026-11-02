import type { ActionVisualEntityTarget } from "./visual-entity-target.js";
import type { JsonObject } from "../../core.js";

export type ActionTarget<TElementTarget = unknown> = {
  type: string;
  id?: string;
  label?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  relativePosition?: { x: number; y: number };
  visualTarget?: ActionVisualEntityTarget;
  elementTarget?: TElementTarget;
  metadata?: JsonObject;
};
