import type { JsonObject } from "../../core.js";

export type ActionSafetyMetadata = {
  level: "safe" | "review" | "privileged" | "destructive";
  requiresApproval?: boolean;
  reversible?: boolean;
  metadata?: JsonObject;
};
