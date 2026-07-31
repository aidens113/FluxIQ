import type { JsonObject } from "../../../core";
import type { SignalProvenance } from "./signals";

export type StateValueType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "point"
  | "rectangle"
  | "entity_ref"
  | "entity_ref_list"
  | "hash"
  | "json"
  | "unknown";

export type StateVolatility = "static" | "slow" | "normal" | "rapid";

export type StateValue<T = unknown> = {
  type: StateValueType;
  value: T;
  observedAt: number;
  sourceId?: string;
  confidence?: number;
  volatility?: StateVolatility;
  semanticRole?: string;
  comparable?: boolean;
  sensitive?: boolean;
  provenance?: SignalProvenance;
  metadata?: JsonObject;
};

export type StateNamespace = {
  schemaId: string;
  schemaVersion: string;
  values: Record<string, StateValue>;
  metadata?: JsonObject;
};

export type StateSnapshot = {
  timestamp: number;
  namespaces: Record<string, StateNamespace>;
  metadata?: JsonObject;
};

export type StateNamespaceId =
  | "app"
  | "runtime"
  | "user"
  | "environment"
  | "recording"
  | "custom"
  | (string & {});

export type StatePath = {
  namespace: StateNamespaceId;
  path: string;
};

export type StatePathPermissions = {
  readable?: boolean;
  writable?: boolean;
  privileged?: boolean;
};

export type StatePathSchema = {
  namespace: StateNamespaceId;
  path: string;
  type: StateValueType;
  label?: string;
  description?: string;
  persistence?: "snapshot" | "session" | "task" | "environment";
  volatility?: StateVolatility;
  permissions?: StatePathPermissions;
  metadata?: JsonObject;
};

export type StateDelta = {
  namespace: string;
  path: string;
  previous?: StateValue;
  current?: StateValue;
  change:
    | "added"
    | "removed"
    | "changed"
    | "increased"
    | "decreased"
    | "became_true"
    | "became_false"
    | "stable";
  confidence?: number;
  metadata?: JsonObject;
};
