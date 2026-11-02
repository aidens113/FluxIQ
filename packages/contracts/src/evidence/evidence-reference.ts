import type { EvidenceLayer } from "./evidence-layer.js";
import type { JsonObject } from "../core.js";

export type EvidenceReference = {
  layer: EvidenceLayer;
  artifactId: string;
  entryId?: string;
  signalPath?: string;
  noteId?: string;
  relationship?: string;
  confidence?: number;
  metadata?: JsonObject;
};
