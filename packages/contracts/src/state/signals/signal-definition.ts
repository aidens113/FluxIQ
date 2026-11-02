import type { SignalProvenance, StateValueType, StateVolatility } from "../contracts/index.js";
import type { ComparatorDefinition } from "./comparator-definition.js";
import type { JsonObject } from "../../core.js";

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
