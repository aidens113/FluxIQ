import type { AutomationStudioFlowOwnerKind } from "./index.ts";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "./index.ts";

export function createBlankAutomationStudioFlow(input: {
  flowId: string;
  ownerKind: AutomationStudioFlowOwnerKind;
  ownerId: string;
  name: string;
  description?: string;
  now?: number;
  metadata?: JsonObject;
}): AutomationStudioFlowDocument {
  const now = input.now ?? Date.now();
  return {
    schemaVersion: "0.1",
    flowId: input.flowId,
    ownerKind: input.ownerKind,
    ownerId: input.ownerId,
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
  };
}
