import type { AutomationStudioSchemaVersion } from "@fluxiq/contracts/recording";
import type { AutomationStudioFlowDocument } from "./index.ts";
import type { JsonObject } from "../../../core/index.ts";

/** @deprecated New authoring must use AutomationStudioFlowArtifact. Read compatibility remains supported. */
export type AutomationStudioTaskArtifact = {
  schemaVersion: AutomationStudioSchemaVersion;
  taskId: string;
  name: string;
  description?: string;
  graphId?: string;
  policyFlowId?: string;
  graph?: AutomationStudioFlowDocument;
  signalRegistryId?: string;
  recordingIds: string[];
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
