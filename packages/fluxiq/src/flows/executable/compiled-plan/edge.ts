import type { JsonObject } from "../../../core/index.ts";

export type AutomationStudioCompiledPlanEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePortId: string | null;
  targetPortId: string | null;
  label: string;
  metadata: JsonObject;
};
