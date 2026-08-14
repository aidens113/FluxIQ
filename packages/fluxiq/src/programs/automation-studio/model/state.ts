import type { JsonObject } from "../../../core/index.ts";
import type { SignalProvenance } from "./signals.ts";

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

export type StateElementKind =
  | "text"
  | "static_id"
  | "internal_id"
  | "selector"
  | "label"
  | "status"
  | "route"
  | "url"
  | "visibility"
  | "enabled"
  | "count"
  | "position"
  | "bounds"
  | "collection"
  | "json"
  | "unknown";

export type StateElementDescriptor = {
  namespace: StateNamespaceId;
  path: string;
  kind: StateElementKind;
  label?: string;
  description?: string;
  entityId?: string;
  entityKind?: string;
  stableAcrossSessions?: boolean;
  sensitive?: boolean;
  presentation?: StatePresentationMetadata;
  metadata?: JsonObject;
};

export type StateCoordinateSpace = {
  width: number;
  height: number;
  unit: "px" | "world" | "cell" | "normalized";
  origin?: "top-left" | "bottom-left" | "center";
  scale?: number;
  metadata?: JsonObject;
};

export type StateBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EvidenceAnchor =
  | { type: "none"; metadata?: JsonObject }
  | { type: "point"; x: number; y: number; rendererId?: string; metadata?: JsonObject }
  | { type: "bounds"; bounds: StateBounds; rendererId?: string; metadata?: JsonObject }
  | { type: "element"; elementId: string; rendererId?: string; metadata?: JsonObject }
  | { type: "entity"; entityId: string; entityKind?: string; rendererId?: string; metadata?: JsonObject }
  | { type: "region"; regionId: string; rendererId?: string; metadata?: JsonObject }
  | { type: "path"; points: Array<{ x: number; y: number }>; rendererId?: string; metadata?: JsonObject };

export type StatePresentationMetadata = {
  label?: string;
  description?: string;
  group?: string;
  icon?: string;
  order?: number;
  anchor?: EvidenceAnchor;
  visualKind?: "image" | "text" | "bounds" | "table" | "tree" | "metric" | "badge" | "json";
  sensitive?: boolean;
  metadata?: JsonObject;
};

export type StateVisualLayer =
  | {
      id: string;
      kind: "image";
      contentRef: string;
      bounds: StateBounds;
      opacity?: number;
      metadata?: JsonObject;
    }
  | {
      id: string;
      kind: "text";
      content: string;
      bounds?: StateBounds;
      anchor?: EvidenceAnchor;
      style?: { tone?: string; size?: "xs" | "sm" | "md" | "lg" };
      metadata?: JsonObject;
    }
  | {
      id: string;
      kind: "region";
      bounds: StateBounds;
      label?: string;
      statePath?: string;
      anchor?: EvidenceAnchor;
      metadata?: JsonObject;
    }
  | {
      id: string;
      kind: "element";
      label?: string;
      bounds?: StateBounds;
      statePath?: string;
      anchor?: EvidenceAnchor;
      metadata?: JsonObject;
    };

export type StateVisualFrame = {
  id: string;
  rendererId?: string;
  label?: string;
  coordinateSpace: StateCoordinateSpace;
  layers: StateVisualLayer[];
  presentation?: StatePresentationMetadata;
  metadata?: JsonObject;
};

export type StateSnapshotPresentation = {
  visualFrames?: StateVisualFrame[];
  defaultFrameId?: string;
  metadata?: JsonObject;
};

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
  presentation?: StatePresentationMetadata;
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
  id?: string;
  timestamp: number;
  namespaces: Record<string, StateNamespace>;
  presentation?: StateSnapshotPresentation;
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
  elementKind?: StateElementKind;
  label?: string;
  description?: string;
  entityId?: string;
  entityKind?: string;
  stableAcrossSessions?: boolean;
  sensitive?: boolean;
  presentation?: StatePresentationMetadata;
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
