// When a batch stops before its last action, and why.
//
// A batch is safe to run at all only because each action names what it acts on
// by a handle that keeps meaning the same thing from one capture to the next,
// so the third action's target is still the control the model read it as,
// after the first two have changed the page. That holds within the context the
// handles were issued in and nowhere else: after a move to another page a
// domain numbers that page's controls afresh, and the same handle names a
// different control. So the batch stops, and the rest of it is reported as not
// run, whenever running on could act on something the model did not mean:
//
// - `action_refused`: the action came back refused or failed. What followed
//   may have depended on it; running on would act on a page the model did not
//   foresee. This is the first-failure rule.
// - `effect_not_applied`: a mutating action reported that its effect did not
//   happen, so the page is not in the state every later action assumed.
// - `targets_may_have_changed`: a mutating action did take effect and its
//   domain did not say that the handles issued so far still mean what they
//   meant. A press on the same page can say so; a navigation cannot. Core
//   cannot tell the two apart, so the absence of that assurance stops the
//   batch -- the default is the safe reading, and a domain earns the longer
//   batch by declaring, per action, `targetsUnchanged: true`.
// - `action_limit` and `batch_limit`: the run's tool-call ceiling, or the
//   per-decision list ceiling, was reached.
//
// An observation that succeeded never stops a batch: it changed nothing.
//
// PERMISSION SEAM (t018, needs-permission outcome). Each action of a batch is
// handed to the caller's `executeTool` on its own, so a run's permission check
// sees every action individually, never the batch as a whole. Today a needed
// permission ends the whole run from inside `executeTool` -- it throws, or it
// aborts the run's signal -- and the loop never catches that to go on to the
// next action. If that contract becomes a returned outcome instead, it is a
// stop reason here, `permission_required`, and the loop must end the run with
// the request rather than report the rest of the batch as not run. It is not
// approximated here: no result code is read as a permission request.

import type { JsonValue } from "../../../../../core/index.ts";

/** Why a batch stopped, and the sentence the model is told. Core's own words, never a tool's or a model's. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_BATCH_STOPS = Object.freeze({
  action_refused: "The action at this point was refused or failed, so the actions listed after it were not run: they may have depended on it. Correct it, then ask again for what you still need.",
  effect_not_applied: "The action at this point did not take effect, so the state was not what the actions listed after it assume, and they were not run.",
  targets_may_have_changed: "The action at this point changed state in a way that may have changed what earlier target handles refer to, such as moving to another page, so the actions listed after it were not run. Choose them again from the latest evidence.",
  action_limit: "The run's action ceiling was reached at this point, so the actions listed after it were not run.",
  batch_limit: "A decision may list only so many actions; those listed after this point were not run. Ask for them in the next decision."
} as const);

export type AutomationStudioLlmEvidenceBatchStop = keyof typeof AUTOMATION_STUDIO_LLM_EVIDENCE_BATCH_STOPS;

/** The recoverable-refusal shape every tool shares, `{ok: false, code}`. */
export function isAutomationStudioLlmEvidenceRefusal(evidence: JsonValue): boolean {
  return Boolean(evidence) && typeof evidence === "object" && !Array.isArray(evidence) && (evidence as Record<string, unknown>).ok === false;
}

/**
 * Whether the batch stops after an action that ran, and why; `undefined` when
 * the next action may run. `effect` is the tool's declaration, the rest is
 * what its execution reported.
 */
export function automationStudioLlmEvidenceBatchStopAfter(ran: {
  effect: "observe" | "mutate" | undefined;
  evidence: JsonValue;
  effectApplied: boolean;
  targetsUnchanged?: boolean;
}): AutomationStudioLlmEvidenceBatchStop | undefined {
  // The recoverable-refusal shape every tool shares, `{ok: false, code}`.
  if (isAutomationStudioLlmEvidenceRefusal(ran.evidence)) return "action_refused";
  if (ran.effect === "observe") return undefined;
  if (ran.effect === "mutate" && !ran.effectApplied) return "effect_not_applied";
  // A mutation that took effect, or a tool that never said what it does.
  return ran.targetsUnchanged === true ? undefined : "targets_may_have_changed";
}

