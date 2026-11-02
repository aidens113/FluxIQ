import type { JsonObject } from "../../core.js";

export type SourceDescriptor = {
  id: string;
  label: string;
  kind: "state" | "action" | "event" | "note" | "observation" | "derived";
  schemaId?: string;
  schemaVersion?: string;
  metadata?: JsonObject;
};
