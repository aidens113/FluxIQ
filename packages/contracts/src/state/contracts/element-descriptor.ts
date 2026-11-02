import type { StateNamespaceId } from "./namespace-id.js";
import type { StateElementKind } from "./element-kind.js";
import type { StatePresentationMetadata } from "./presentation-metadata.js";
import type { JsonObject } from "../../core.js";

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
