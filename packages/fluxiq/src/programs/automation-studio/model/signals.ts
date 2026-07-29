import type { JsonObject } from "../../../core";
import type { AutomationStudioSchemaVersion } from "./evidence";
import type { StateValueType, StateVolatility } from "./state";

export type SignalProvenance = {
  extractorId: string;
  extractorVersion: string;
  inputs: string[];
  computationHash?: string;
};

export type ComparatorDefinition = {
  kind: "exact" | "numeric" | "semantic" | "similarity" | "custom";
  tolerance?: number;
  customComparatorId?: string;
  metadata?: JsonObject;
};

export type SignalDefinition = {
  path: string;
  type: StateValueType;
  namespace: string;
  description?: string;
  comparator: ComparatorDefinition;
  defaultWeight: number;
  volatility: StateVolatility;
  persistence: "snapshot" | "session" | "task" | "environment";
  tags: string[];
  derived?: boolean;
  provenance?: SignalProvenance;
  sensitive?: boolean;
  metadata?: JsonObject;
};

export type SignalRegistry = {
  schemaVersion: AutomationStudioSchemaVersion;
  registryId: string;
  definitions: SignalDefinition[];
  metadata?: JsonObject;
};
