import type { EvidenceReference } from "../../evidence/index.js";
import type { TimelineBase } from "./timeline-base.js";
import type { ActionResult, ActionVisualEntityTarget } from "../../runtime/actions/index.js";

export type ActionEntry<TTarget = unknown, TEvidence = EvidenceReference> = TimelineBase & {
  type: "action";
  /** Registered output represented by this recorded action, when executable. */
  outputId?: string;
  confirmationInputId?: string;
  confirmationTimeoutMs?: number;
  actionType: string;
  parameters: Record<string, unknown>;
  target?: TTarget;
  visualTarget?: ActionVisualEntityTarget;
  origin: "operator" | "runtime" | "assistant" | "external";
  startedAt: number;
  completedAt?: number;
  result?: ActionResult<TEvidence>;
};
