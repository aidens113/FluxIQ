// Why a runtime target override was refused, in words Core owns, and the
// contract a domain's target check answers in.
//
// `absent` and `ambiguous` alone described a repair of an action the domain
// cannot repair at all, a parameter the model invented and a handle it was
// never shown in the same two words, so a refused live repair could not say
// which it was (`run-mu4rpka7-845d919a`). A domain may name one of these; Core
// repeats nothing else it says.
//
// The four `target_*` words and `recorded_target_unknown` exist because a
// handle the model was shown, naming a control the verb can use, is still not
// a repair when that control is another one. The live repair campaign of
// 2026-09-17 proposed "Save changes and exit" for a recorded "Save changes",
// one of two identical "Continue" buttons, and whatever button was left on a
// page whose item had been deleted; each passed a check that asked only
// whether the model had seen the control.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioRuntimeTargetOverrideTarget } from "../llm/index.ts";

export const AUTOMATION_STUDIO_RUNTIME_TARGET_OVERRIDE_REFUSAL_REASONS = Object.freeze({
  action_not_repairable: "the failed action offers nothing a repair may re-point",
  parameter_not_offered: "the target names a parameter the failed action does not offer",
  parameter_missing: "the target leaves a required parameter unnamed",
  target_malformed: "the target is not a map of parameters to handles",
  handle_not_issued: "a handle is not one the evidence issued",
  handle_incompatible: "a handle names something the failed action cannot use",
  handle_ambiguous: "a handle names more than one thing in the evidence",
  no_compatible_element: "nothing in the evidence could fill a parameter",
  evidence_unrecognized: "the evidence is not a packet the domain issued",
  target_indistinguishable: "the thing a handle names cannot be told apart from another the failed action could use",
  target_not_equivalent: "the thing a handle names does something other than what the failed action's own target did",
  target_unanchored: "nothing that identified the failed action's own target survives on the thing a handle names",
  recorded_target_unknown: "nothing says what the failed action's own target was, so nothing can be shown to be it",
  /** Core's own: no domain check was bound, or there was no evidence to check against. Never passed through. */
  domain_check_unavailable: "no domain check is bound to judge the target",
  /**
   * Core's own: the failure's class is not one Core offers a target override
   * for (`classifyAutomationStudioAdaptiveFailure`), so the domain is not asked.
   * A link guard that refused a destination, or a page that was retired, is not
   * cured by pressing something else.
   */
  failure_not_target_repairable: "the action did not fail for want of its target, so a different target cannot fix it"
} as const);

export type AutomationStudioRuntimeTargetOverrideRefusalReason = keyof typeof AUTOMATION_STUDIO_RUNTIME_TARGET_OVERRIDE_REFUSAL_REASONS;

/**
 * The thing an accepted target names, as a person would recognise it: its name
 * exactly as the evidence the model was shown printed it, and one plain word or
 * two for what sort of thing it is, in the domain's own vocabulary. A domain
 * supplies it with an accepted target so a repair that needs permission can say
 * what it would act on. Core carries it only to the permission gate, which
 * withholds a name that never appeared in evidence already shown.
 */
export type AutomationStudioRuntimeTargetOverrideControl = { name: string; kind?: string };

export type AutomationStudioRuntimeTargetOverrideEvidenceValidation =
  | { status: "matched"; control?: AutomationStudioRuntimeTargetOverrideControl }
  | { status: "resolved"; target: AutomationStudioRuntimeTargetOverrideTarget; control?: AutomationStudioRuntimeTargetOverrideControl }
  | { status: "absent" | "ambiguous"; reason?: AutomationStudioRuntimeTargetOverrideRefusalReason };

/** A domain's refusal as Core records it: the status, and the reason only where it is one of Core's. */
export type AutomationStudioRuntimeTargetOverrideRefusal = {
  status: "absent" | "ambiguous";
  reason?: AutomationStudioRuntimeTargetOverrideRefusalReason;
};

/** Bounded, domain-neutral identity of the action whose target failed. */
export type AutomationStudioRuntimeTargetOverrideFailedAction = Readonly<{
  nodeId: string;
  definitionId: string;
  /**
   * The registered output the failed node dispatches, where the Flow says so:
   * a policy action's `parameterValues.outputId`, or the `outputActionId` a
   * bootstrap wrote into the node's metadata. Absent where the Flow names
   * none. A recorded action is a `builtin.policy.action` node, whose
   * definition id is the same for a click, a type and a scrape, so this is the
   * only part of the identity that says which verb failed.
   */
  outputId?: string;
  /**
   * What the failed node addressed, as the Flow holds it: the `element` and
   * `target` of its action payload -- a policy action's `parameters`, any other
   * node's own parameter values -- each only where it is a plain object. Core
   * carries both without reading them, and nothing else of the payload rides
   * along. The domain that wrote them judges a proposed target against them:
   * without them it cannot tell a renamed control from a different one.
   * Absent where the node holds neither.
   */
  recordedTarget?: Readonly<{ element?: JsonObject; target?: JsonObject }>;
}>;
