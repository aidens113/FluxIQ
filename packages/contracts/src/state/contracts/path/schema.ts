import type { StateNamespaceId } from "../index.js";
import type { StateValueType } from "../index.js";
import type { StateElementKind } from "../index.js";
import type { StatePresentationMetadata } from "../index.js";
import type { StateVolatility } from "../index.js";
import type { StatePathPermissions } from "./permissions.js";
import type { JsonObject } from "../../../index.js";

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
