import type { StateNamespace } from "./namespace.js";
import type { StateSnapshotPresentation } from "./snapshot-presentation.js";
import type { JsonObject } from "../../core.js";

export type StateSnapshot = {
  id?: string;
  timestamp: number;
  namespaces: Record<string, StateNamespace>;
  presentation?: StateSnapshotPresentation;
  metadata?: JsonObject;
};
