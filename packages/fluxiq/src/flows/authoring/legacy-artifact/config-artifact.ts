import type { AutomationStudioSchemaVersion } from "@fluxiq/contracts/recording";
import type { JsonObject } from "../../../core/index.ts";

export type AutomationStudioConfigArtifact = {
  schemaVersion: AutomationStudioSchemaVersion;
  configId: string;
  name: string;
  description?: string;
  values: JsonObject;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
