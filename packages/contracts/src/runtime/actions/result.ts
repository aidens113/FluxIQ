import type { EvidenceReference } from "../../evidence/index.js";
import type { JsonObject } from "../../core.js";

export type ActionResult<TEvidence = EvidenceReference> = {
  status: "succeeded" | "failed" | "timed_out" | "cancelled" | "unknown";
  message?: string;
  evidence?: TEvidence[];
  metadata?: JsonObject;
};
