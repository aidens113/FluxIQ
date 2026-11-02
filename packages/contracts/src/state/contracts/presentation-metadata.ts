import type { EvidenceAnchor } from "./evidence-anchor.js";
import type { JsonObject } from "../../core.js";

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
