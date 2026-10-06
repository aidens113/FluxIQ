// An act whose only step may be skipped is not done when the build completes.
//
// **The defect this closes (live run `run-musq0b1m-0472cfa0`, Cause 5).** At
// decision 0068 the model marked optional the only step doing a1.version (the
// 7-in-1 press), saying 7-in-1 was "already selected by default" while every
// view showed 4-in-1 marked. The checklist said `step_is_optional`, which is
// information (t195), the completion check passed, the test replayed the
// press, and both judges dismissed the flag because it "was replayed". In
// playback a failed 7-in-1 press carries on and adds the 4-in-1: an optional
// step is one the Flow may skip, so an act no other step does is an act the
// Flow may never do, and no single passing test shows otherwise.
//
// **What is answered, and how.** An act or a choice for which no step named
// answers, and the step judged is kept and changed something but is marked
// `optional` (`./step-fault.ts`, `step_is_optional`). A step made conditional
// with `only_if` is not optional -- its check says when it is needed -- and an
// interruption the Flow writes as optional (`../../flow-draft/sometimes-present.ts`)
// keeps no `optional` of its own, so neither is answered here. The completion
// is answered "not complete" with the act, its step and one sentence saying
// why (`said`, `./check.ts`), and what to do: make the step always run, guard
// it with `only_if`, or, for a choice the page shows made without it, name the
// step after which it showed.
//
// The verdict is read exactly as the check reads it, with the host's declared
// arrival (t262): a step that only arrives is answered `step_only_arrives`
// before it is asked whether it is optional, so the two rules never disagree
// about which step arrived.
//
// The checklist (`./checklist.ts`) still says the same todo every decision:
// this is that information, held at the one moment it decides something.
//
// Nothing here calls a provider or reads a page.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../llm/harness-options/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import { checkAutomationStudioInstructedActs } from "./check.ts";

/** The issue an act whose only step may be skipped is answered under. */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE = "bootstrap.instructed_act_only_optional";

/** What the model is told about such an act, after the opening sentence of a refusal. */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ONLY_INSTRUCTION = " missingActs.acts with reason step_is_optional are things the person asked for -- quote is their words -- "
  + "that only one step of your Flow (step) does, and that step is marked optional: the Flow carries on when it fails, so the act may never be done, and one passing test does not show it always is. "
  + "For each one: make that step always run with amend_draft keep on it, with no act; or, if it is needed only in some situations, make it only_if on the step that shows it is needed instead of optional. "
  + "If it is a choice the item's page already shows made without that step, check that on the page first, then drop the step and name the choice's id on the step after which the page showed it made. Then complete again.";

/** Every act the draft does with an optional step alone, or what the model is told instead. */
export type AutomationStudioInstructedActOptionalVerdict =
  | { ok: true }
  | { ok: false; issue: AutomationStudioFlowBootstrapIssue; missingActs: { acts: JsonObject[] }; instruction: string };

/** Whether any act or choice is done only by a step the Flow may skip. Undefined input answers ok. */
export function checkAutomationStudioInstructedActsOptionalOnly(input: {
  instructionText?: string | undefined;
  result: JsonObject;
  draftSteps?: readonly AutomationStudioFlowDraftStep[] | undefined;
  startLocation?: string | undefined;
  arrival?: NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["runsNodes"]>["arrival"] | undefined;
}): AutomationStudioInstructedActOptionalVerdict {
  const verdict = checkAutomationStudioInstructedActs(input);
  if (verdict.ok) return { ok: true };
  const acts = (Array.isArray(verdict.missingActs.acts) ? verdict.missingActs.acts : [])
    .filter((act): act is JsonObject => typeof act === "object" && act !== null && !Array.isArray(act) && act.reason === "step_is_optional");
  if (!acts.length) return { ok: true };
  return {
    ok: false,
    issue: {
      severity: "error",
      code: AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE,
      // Core's own sentence, quoting nothing; the person's words travel under `missingActs`.
      message: "The instruction asks for something that only an optional step of this draft does, so the Flow may never do it.",
      path: "acts"
    },
    missingActs: { acts },
    instruction: `Nothing was created and this build is still open.${AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ONLY_INSTRUCTION}`
  };
}
