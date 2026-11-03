import type { AutomationStudioSchemaVersion } from "@fluxiq/contracts/recording";
import type { JsonObject } from "../../../core/index.ts";

/** @deprecated New authoring must use AutomationStudioFlowArtifact and published composites. */
export type AutomationStudioRoutineArtifact = {
  schemaVersion: AutomationStudioSchemaVersion;
  routineId: string;
  name: string;
  description?: string;
  flowId?: string;
  taskIds: string[];
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
