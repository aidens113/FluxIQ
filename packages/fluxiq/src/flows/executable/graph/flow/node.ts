import type { JsonObject } from "../../../../core/index.ts";
export type AutomationStudioFlowNode = {
  id: string;
  definitionId: string;
  /** Exact node-definition version used to author this instance. Optional only for legacy documents. */
  definitionVersion?: string;
  label?: string;
  description?: string;
  parameterValues?: JsonObject;
  position?: { x: number; y: number };
  metadata?: JsonObject;
};
