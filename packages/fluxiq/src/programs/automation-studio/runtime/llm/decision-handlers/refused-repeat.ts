// A call refused before it runs, because the same call already failed or
// changed nothing on this same page (`../repeat-guard/outcomes.ts`).
//
// The decision is recorded as refused, the model is told what happened then
// and what to do instead, and the no-progress guard counts it. Refused repeats
// in a row end the round as a stall (`AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW`):
// a build then tests and judges the Flow so far, and repairs it or says why it
// cannot be done (`../../flow-bootstrap/unfinished-build/phases.ts`). Never an
// endless loop, and never silent.

import { automationStudioLlmDecisionContextSignature, automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { automationStudioLlmEvidenceLoopFailure as failure, type AutomationStudioLlmEvidenceLoopDecision } from "../evidence-loop/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW,
  AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE,
  automationStudioLlmEvidenceRepeatRefusalNote,
  type AutomationStudioLlmEvidenceRepeatedOutcome
} from "../repeat-guard/index.ts";
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
  const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: decision.toolId, earlier, inARow });
  context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID, value: note });
  return { kind: "continue" };
}

/**
 * Counts one refused repeat against the round -- a call above, or a rerun the
 * amendment handler refused as `changes_nothing` (`./amendment.ts`) -- and
 * says how the round stops when this one is the last allowed: stalled with the
 * error its caller builds, ended where it has none, or nothing while it goes on.
 */
export function automationStudioLlmEvidenceRepeatStop(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  inARow: number
): Extract<AutomationStudioLlmEvidenceRefusedRepeatNext, { kind: "stalled" | "end" }> | undefined {
  const { input, trace, accounting, draftSteps, noProgress } = context;
  noProgress.stepped();
  if (inARow < AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW && !noProgress.reached()) return undefined;
  if (input.unusableDecisions) {
    return { kind: "stalled", error: input.unusableDecisions.stalled({ issueCodes: [AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE], trace: [...trace], accounting: { ...accounting }, steps: draftSteps.map((step) => structuredClone(step)) }) };
  }
  return { kind: "end", result: failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting) };
}
