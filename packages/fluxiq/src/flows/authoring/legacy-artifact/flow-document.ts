import type { AutomationStudioSchemaVersion } from "@fluxiq/contracts/recording";
import type { AutomationStudioFlowOwnerKind } from "./index.ts";
import type { AutomationStudioFlowNode } from "../../executable/graph/index.ts";
import type { AutomationStudioFlowEdge } from "../../executable/graph/index.ts";
import type { JsonObject } from "../../../core/index.ts";

/** @deprecated Use owner-independent AutomationStudioFlowArtifact for new writes. */
export type AutomationStudioFlowDocument = {
  schemaVersion: AutomationStudioSchemaVersion;
  flowId: string;
  ownerKind: AutomationStudioFlowOwnerKind;
  ownerId: string;
  name: string;
  description?: string;
  nodes: AutomationStudioFlowNode[];
  edges: AutomationStudioFlowEdge[];
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
