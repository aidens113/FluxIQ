import type { JsonObject } from "../../../../core/index.ts";
export type AutomationStudioFlowEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePortId?: string;
  targetPortId?: string;
  label?: string;
  metadata?: JsonObject;
};
