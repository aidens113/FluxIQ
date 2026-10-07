// Three decisions in a row refused, or changing nothing, for one reason end the
// round, and the build tests and judges the Flow so far instead of spending its
// purse (week report W2, the user's rule of 2026-10-06; the counting is
// `../evidence-progress/refusal-run.ts`).
//
// What counts, and as which kind:
//   - an amendment decision that changed nothing (`./amendment.ts`): its
//     refusals' reasons, or "keep adds nothing", or an edit that undid itself;
//   - a rerun that changed nothing, or found what its step had found
//     (`./refused-repeat.ts`, `./rerun-result.ts`);
//   - a call that would add a step or change the page and that the page
//     refused, applying nothing, by its result code -- unless the code says to
//     try again later (`../repeat-guard/retry-later.ts`). Looks are left to the
//     searching guard (`./searching.ts`).
// Anything else decided between two of these breaks the run. At the second
// the model is told that one more ends this exploration; at the third the
// round stalls the way a run of refused repeats does (`./refused-repeat.ts`):
// with `unusableDecisions` configured, under the issue code the person's
// ending reads its reason from (`../../flow-bootstrap/unfinished-build/not-done.ts`).
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW } from "../evidence-progress/index.ts";
import { automationStudioLlmEvidenceLoopFailure as failure, type AutomationStudioLlmEvidenceLoopResult } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE, automationStudioLlmEvidenceRetriesLater } from "../repeat-guard/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** The evidence entry the warning before the last refusal of a run is told under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID = "core.refusal_run";

/**
 * Decision `iteration` was refused, or changed nothing, for `kind`. Answers the
 * loop's ending when this is the third of one kind in a row (or throws the
 * stall, where decision errors propagate), and nothing while the round goes
 * on; at the second the model is warned. `issueCode` is what the stall is
 * recorded under.
 */
export function automationStudioLlmEvidenceRefusedOfAKind(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  kind: string,
  issueCode: string
): AutomationStudioLlmEvidenceLoopResult | undefined {
  const inARow = context.refusalRun.refused(iteration, kind);
  const { input, trace, accounting, draftSteps, evidence } = context;
  if (inARow >= AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW) {
    if (input.unusableDecisions) {
      const error = input.unusableDecisions.stalled({ issueCodes: [issueCode], trace: [...trace], accounting: { ...accounting }, steps: draftSteps.map((step) => structuredClone(step)) });
      if (input.propagateDecisionErrors) throw error;
    }
    return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
  }
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID);
  if (inARow < AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW - 1) return undefined;
  const value: JsonObject = {
    ok: false,
    code: "llm_evidence_loop.refused_in_a_row",
    refusal: kind,
    inARow,
    maxInARow: AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW,
    instruction: `Your last ${inARow} decisions were refused, or changed nothing, for the same reason (${kind}). One more decision refused for it ends this exploration, and the Flow is then tested and judged as it stands. `
      + "Do not send another decision of that kind: do what next beside the refusal says instead, run what the Flow still lacks, or complete if the Flow already does what the person asked."
  };
  context.accountEvidence(value);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID, value });
  return undefined;
}

/**
 * A call that ran: one more of a run of refusals when the page refused it,
 * applied nothing, would have added a step or changed the page, and its code
 * does not say to try again later (header). Answers the loop's ending when the
 * round stops here.
 */
export function automationStudioLlmEvidenceRefusedCallRun(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  call: { refused: boolean; effectApplied: boolean; effect: string; proposes?: boolean | undefined; resultCode?: string | undefined; resultReason?: string | undefined }
): AutomationStudioLlmEvidenceLoopResult | undefined {
  const counts = call.refused && !call.effectApplied && (call.effect === "mutate" || call.proposes === true) && !automationStudioLlmEvidenceRetriesLater(call.resultCode, call.resultReason);
  return counts ? automationStudioLlmEvidenceRefusedOfAKind(context, iteration, `call:${call.resultCode ?? "refused"}`, AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE) : undefined;
}
