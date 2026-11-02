import type { StateValue } from "./value.js";
import type { JsonObject } from "../../core.js";

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
