import type { AutomationStudioSchemaVersion } from "../../evidence/index.js";
import type { SignalDefinition } from "./signal-definition.js";
import type { JsonObject } from "../../core.js";

export type SignalRegistry = {
  schemaVersion: AutomationStudioSchemaVersion;
  registryId: string;
  definitions: SignalDefinition[];
  metadata?: JsonObject;
};
