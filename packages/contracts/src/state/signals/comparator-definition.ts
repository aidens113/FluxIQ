import type { JsonObject } from "../../core.js";

export type ComparatorDefinition = {
  kind: "exact" | "numeric" | "semantic" | "similarity" | "custom";
  tolerance?: number;
  customComparatorId?: string;
  metadata?: JsonObject;
};
