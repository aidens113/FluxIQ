// A call refused before it runs, because the same call already failed or
// changed nothing on this same page (`../repeat-guard/outcomes.ts`).
//
// The decision is recorded as refused, the model is told what happened then
// and what to do instead, and the no-progress guard counts it. Refused repeats
// in a row end the round as a stall (`AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW`):
// a build then tests and judges the Flow so far, and repairs it or says why it
// cannot be done (`../../flow-bootstrap/unfinished-build/phases.ts`). In
// candidate mode (`discoveryOnly`) there is no draft to test, so the build ends
// with nothing tested, and the note says so and never names the draft
// (`../repeat-guard/candidate-feedback.ts`). Never an endless loop, and never
// silent.

import { automationStudioLlmDecisionContextSignature, automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { automationStudioLlmEvidenceLoopFailure as failure, type AutomationStudioLlmEvidenceLoopDecision, type AutomationStudioLlmEvidenceLoopResult } from "../evidence-loop/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW,
  AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE,
  automationStudioLlmEvidenceRepeatRefusalNote,
  type AutomationStudioLlmEvidenceRepeatedOutcome
} from "../repeat-guard/index.ts";
import { automationStudioLlmEvidenceRefusedOfAKind } from "./refusal-run.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext, AutomationStudioLlmEvidenceDecisionNext } from "./types.ts";

/** What the loop does after a refused repeat: ask again, end, or stall the round with the error its caller built. */
export type AutomationStudioLlmEvidenceRefusedRepeatNext = Exclude<AutomationStudioLlmEvidenceDecisionNext, { kind: "rerun" }> | { kind: "stalled"; error: unknown };

/** Refuses one tool call as a repeat of `earlier`, unrun. */
export function automationStudioLlmEvidenceHandleRefusedRepeat(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>,
  earlier: AutomationStudioLlmEvidenceRepeatedOutcome
): AutomationStudioLlmEvidenceRefusedRepeatNext {
  const { evidence, history } = context;
  const issueCodes = [AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE];
  history.record(iteration, { kind: "unusable", signature: automationStudioLlmDecisionContextSignature({ kind: "unusable", issueCodes }), issueCodes });
  context.recordRow({ iteration, decision: "tool_call", toolId: decision.toolId, resultCode: AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE, resultReason: earlier.outcome, ...(decision.usage ? { usage: decision.usage } : {}) });
  const inARow = context.repeats.refusedAgain(iteration);
  const stop = automationStudioLlmEvidenceRepeatStop(context, inARow);
  if (stop) return stop;
  const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: decision.toolId, earlier, inARow, candidate: context.input.discoveryOnly === true });
  context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID, value: note });
  return { kind: "continue" };
}

/**
 * A rerun that ran and changed nothing -- or changed its argument and found
 * exactly what its step had found (`./rerun-result.ts`): it put back a step identical to the one
 * it replaced, with the same result, so the Flow is as it was and its new step
 * id is not the draft advancing (`./amendment.ts`, live run
 * `run-muwaobm2-882cadd9`, where each such rerun read as progress). It is a step
 * without progress and one more decision in a row that changed nothing, in the
 * same run as the identical decision then refused unrun. Answers the loop's
 * ending when the round stops here, or nothing while it goes on.
 */
export function automationStudioLlmEvidenceRerunChangedNothing(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number
): AutomationStudioLlmEvidenceLoopResult | undefined {
  // One kind with a rerun that found what its step had found (`./rerun-result.ts`): both left the Flow's result as it was (`./refusal-run.ts`).
  const ofAKind = automationStudioLlmEvidenceRefusedOfAKind(context, iteration, "rerun_changed_nothing", AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE);
  if (ofAKind) return ofAKind;
  const stop = automationStudioLlmEvidenceRepeatStop(context, context.repeats.refusedAgain(iteration));
  if (stop?.kind === "stalled") {
    if (context.input.propagateDecisionErrors) throw stop.error;
    return failure(context.draftSteps, "llm_evidence_loop.repeat_without_progress", context.trace, context.accounting);
  }
  if (stop) return stop.result;
  context.noProgress.redirect(iteration);
  return undefined;
}

/**
 * Counts one refused repeat against the round -- a call above, or a rerun the
 * amendment handler refused as `changes_nothing` (`./amendment.ts`) -- and
 * says how the round stops when this one is the last allowed: stalled with the
 * error its caller builds, ended where it has none, or nothing while it goes on.
 * `issueCode` is what the stall is recorded under, and what the person's
 * ending reads its reason from: the repeat refusal by default, the amendment
 * refusal for a run of amendments refused again (`./amendment.ts`).
 */
export function automationStudioLlmEvidenceRepeatStop(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  inARow: number,
  issueCode: string = AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE
): Extract<AutomationStudioLlmEvidenceRefusedRepeatNext, { kind: "stalled" | "end" }> | undefined {
  const { input, trace, accounting, draftSteps, noProgress } = context;
  noProgress.stepped();
  if (inARow < AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW && !noProgress.reached()) return undefined;
  if (input.unusableDecisions) {
    return { kind: "stalled", error: input.unusableDecisions.stalled({ issueCodes: [issueCode], trace: [...trace], accounting: { ...accounting }, steps: draftSteps.map((step) => structuredClone(step)) }) };
  }
  return { kind: "end", result: failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting) };
}
