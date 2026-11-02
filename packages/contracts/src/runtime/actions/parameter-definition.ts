import type { StateValueType } from "../../state/contracts/index.js";
import type { JsonObject } from "../../core.js";

export type ParameterDefinition = {
  type: StateValueType | "array" | "object";
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  sensitive?: boolean;
  metadata?: JsonObject;
};
