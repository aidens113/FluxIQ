// Whether a node may be run again on a re-entry (state-aware recovery plan, C2).
//
// This module owns the replay restriction, derived from the existing
// side-effect model (`../defensive/node-side-effect.ts`, `lasting-act.ts`)
// rather than declared beside it, so a Route or a checkpoint re-entry reads the
// same answer the retry policy does.

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS } from "../../../nodes/control-flow/index.ts";
import { automationStudioNodeActLasts, automationStudioNodeRepeatIsSafe, automationStudioNodeSideEffectClass } from "../defensive/index.ts";

/**
 * - `safe`: running the node again cannot act twice;
 * - `reconcile`: its act lasts, so re-entering a path that would repeat it
 *   needs the act's effect check to say `not_landed` first;
 * - `never`: it is destructive or gated behind a person's approval, so no
 *   re-entry repeats it.
 */
export type AutomationStudioReplayRestriction = "safe" | "reconcile" | "never";

const STRICTNESS: Readonly<Record<AutomationStudioReplayRestriction, number>> = { safe: 0, reconcile: 1, never: 2 };

/**
 * The node's replay restriction: `never` when it is destructive or needs
 * approval (whatever else it says about itself), else `safe` when it states
 * repeating is safe, else `reconcile` when its act lasts, else `safe`.
 * `metadata.replay` may tighten that answer and is ignored where it would
 * loosen it.
 */
export function automationStudioNodeReplayRestriction(node: AutomationStudioFlowNode): AutomationStudioReplayRestriction {
  const derived = derivedRestriction(node);
  const declared = node.metadata?.[AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.replay];
  if (declared !== "safe" && declared !== "reconcile" && declared !== "never") return derived;
  return STRICTNESS[declared] > STRICTNESS[derived] ? declared : derived;
}

function derivedRestriction(node: AutomationStudioFlowNode): AutomationStudioReplayRestriction {
  const needsApproval = node.parameterValues?.requiresApproval === true || node.metadata?.requiresApproval === true;
  if (needsApproval || automationStudioNodeSideEffectClass(node) === "destructive") return "never";
  if (automationStudioNodeRepeatIsSafe(node)) return "safe";
  return automationStudioNodeActLasts(node) ? "reconcile" : "safe";
}
