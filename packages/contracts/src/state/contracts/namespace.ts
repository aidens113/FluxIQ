import type { StateValue } from "./value.js";
import type { JsonObject } from "../../core.js";

export type StateNamespace = {
  schemaId: string;
  schemaVersion: string;
  values: Record<string, StateValue>;
  metadata?: JsonObject;
};
