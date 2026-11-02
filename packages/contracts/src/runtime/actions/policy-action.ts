import type { EvidenceReference } from "../../evidence/index.js";
import type { ActionVisualEntityTarget } from "./visual-entity-target.js";
import type { JsonObject } from "../../core.js";

export type PolicyAction<TTarget = unknown, TEvidence = EvidenceReference> = {
  id: string;
  /** Registered domain output to dispatch. New generated policies always use this. */
  outputId?: string;
  /** Action input stream awaited as confirmation after dispatch. */
  confirmationInputId?: string;
  confirmationTimeoutMs?: number;
  /** @deprecated Compatibility field for policies recorded before output bindings. */
  actionType: string;
  parameters: Record<string, unknown>;
  target?: TTarget;
  visualTarget?: ActionVisualEntityTarget;
  sourceEvidence?: TEvidence[];
  metadata?: JsonObject;
};
