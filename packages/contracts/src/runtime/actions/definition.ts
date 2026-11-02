import type { ParameterDefinition } from "./parameter-definition.js";
import type { PreflightDefinition } from "./preflight-definition.js";
import type { ActionSafetyMetadata } from "./safety-metadata.js";
import type { JsonObject } from "../../core.js";

export type ActionDefinition = {
  actionType: string;
  schemaVersion: string;
  parameters: Record<string, ParameterDefinition>;
  preflight?: PreflightDefinition;
  capabilities?: string[];
  safety?: ActionSafetyMetadata;
  metadata?: JsonObject;
};
