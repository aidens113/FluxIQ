/// A call refused before it runs, because the same call already failed or
// changed nothing on this same page (`../repeat-guard/outcomes.ts`).
//
// The decision is recorded as refused, the model is told what happened then
// and what to do instead, and it is a step without progress. Refused repeats
// in a row end no round (t1056): from
// `AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW` the run is
// raised on loop detection's ladder (`./ladder-top.ts`), which steers the
// model and offers its own decision of how to go on. A loop whose caller takes
// the signal ends the round there only if that caller says so; any other loop
// goes on, running the caller's own move first where it names one -- a
// candidate build's retest of its latest revision (`./stall-recovery.ts`,
// t477). The note never names a draft a loop does not have
// (`../repeat-guard/candidate-feedback.ts`). Never silent, and never ended by a
// count: the purse ends a loop that will not stop repeating.

import { automationStudioLlmDecisionContextSignature, automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID } from "../evidence-recall/tool-id.ts";
import { automationStudioLlmEvidenceLoopFailure as failure, type AutomationStudioLlmEvidenceLoopDecision, type AutomationStudioLlmEvidenceLoopResult } from "../evidence-loop/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW,
  AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE,
  automationStudioLlmEvidenceRepeatRefusalNote,
  type AutomationStudioLlmEvidenceRepeatedOutcome
} from "../repeat-guard/index.ts";
import { automationStudioLlmEvidenceLadderTop } from "./ladder-top.ts";
import { automationStudioLlmEvidenceRefusalDecisionAsk } from "./refusal-decision-ask.ts";
import { automationStudioLlmEvidenceRefusedOfAKind } from "./refusal-run.ts";
import { automationStudioLlmEvidenceRepeatStall } from "./repeat-stall.ts";
import type { AutomationStudioLlmEvidenceStallOutcome } from "./stall-recovery.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext, AutomationStudioLlmEvidenceDecisionNext } from "./types.ts";

/** What the loop does after a refused repeat: ask again, end, stall the round with the error its caller built, or run the call its caller recovers the stall with. */
export type AutomationStudioLlmEvidenceRefusedRepeatNext = Exclude<AutomationStudioLlmEvidenceDecisionNext, { kind: "rerun" }> | { kind: "stalled"; error: unknown } | Extract<AutomationStudioLlmEvidenceStallOutcome, { kind: "recover" }>;

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
  // One more for the detector when the guard refused it; the ladder counted its own (`./loop-check.ts`).
  if (earlier.repeats === undefined) context.loops.guardRefused(decision.toolId, decision.input, context.contextOf(decision.toolId), context.repeats.state());
  const inARow = context.repeats.refusedAgain(iteration);
  const stop = automationStudioLlmEvidenceRepeatStop(context, inARow, undefined, iteration) ?? automationStudioLlmEvidenceLoopOverdue(context, iteration);
  if (stop) return stop;
  // A loop that drafts nothing -- a project's supervisor, a reset -- is never told a Flow so far is tested and judged (t591).
  const candidate = context.input.discoveryOnly === true;
  // Where the model decides how to go on (`./refusal-decision-ask.ts`), a refused repeat asks for that decision too.
  const note = automationStudioLlmEvidenceRefusalDecisionAsk(context, automationStudioLlmEvidenceRepeatRefusalNote({ toolId: decision.toolId, earlier, inARow, candidate, undrafted: !candidate && context.input.draft === false, recallOffered: context.toolIds.has(AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID) }), decision.toolId, earlier, inARow);
  context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID, value: note });
  return { kind: "continue" };
}

/**
 * The round stops here, now, under `issueCode`: the stall its caller built, thrown where decision
 * errors propagate, else the loop's own ending. What a model's own `ask_person` ends its round with
 * once the caller has taken the question (`./model-decision.ts`).
 */
export function automationStudioLlmEvidenceStallNow(context: AutomationStudioLlmEvidenceDecisionHandlerContext, issueCode: string): AutomationStudioLlmEvidenceLoopResult {
  const stop = automationStudioLlmEvidenceRepeatStall(context, issueCode);
  if (stop.kind === "end") return stop.result;
  if (stop.kind === "stalled" && context.input.propagateDecisionErrors) throw stop.error;
  return failure(context.draftSteps, "llm_evidence_loop.repeat_without_progress", context.trace, context.accounting);
}

/**
 * A rerun that ran and changed nothing -- or changed its argument and found
 * exactly what its step had found (`./rerun-result.ts`): it put back a step identical to the one
 * it replaced, with the same result, so the Flow is as it was and its new step
 * id is not the draft advancing (`./amendment.ts`, live run
 * `run-muwaobm2-882cadd9`, where each such rerun read as progress). It is a step
 * without progress and one more decision in a row that changed nothing, in the
 * same run as the identical decision then refused unrun. Answers the loop's
 * ending where a caller ends the round on it, or nothing while it goes on.
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
 * amendment handler refused as `changes_nothing` (`./amendment.ts`). From
 * `AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW` in a row the run
 * is raised on loop detection's ladder (`./ladder-top.ts`): it ends no round on
 * its own (t1056), and a loop goes on unless its caller ends the round there,
 * in which case this says how: stalled with the error its caller builds, or
 * ended where it has none. `issueCode` is what that stall is recorded under,
 * and what the person's ending reads its reason from: the repeat refusal by
 * default, the amendment refusal for a run of amendments refused again
 * (`./amendment.ts`).
 */
export function automationStudioLlmEvidenceRepeatStop(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  inARow: number,
  issueCode?: string
): Extract<AutomationStudioLlmEvidenceRefusedRepeatNext, { kind: "stalled" | "end" }> | undefined;
/**
 * The same, for a caller that can run a call: given the iteration, a loop with
 * no caller to end it runs the caller's own move where it names one
 * (`./stall-recovery.ts`), and answers that call to run.
 */
export function automationStudioLlmEvidenceRepeatStop(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  inARow: number,
  issueCode: string | undefined,
  recoverAt: number
): Extract<AutomationStudioLlmEvidenceRefusedRepeatNext, { kind: "stalled" | "end" | "recover" }> | undefined;
export function automationStudioLlmEvidenceRepeatStop(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  inARow: number,
  issueCode: string = AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE,
  recoverAt?: number
): Extract<AutomationStudioLlmEvidenceRefusedRepeatNext, { kind: "stalled" | "end" | "recover" }> | undefined {
  const { noProgress } = context;
  noProgress.stepped();
  if (inARow < AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW) return undefined;
  const next = automationStudioLlmEvidenceLadderTop(context, recoverAt ?? context.accounting.iterations, context.loops.stalling(), issueCode, recoverAt);
  if (next) return next;
  // Going on: the run of refusals counts again from nothing, and the loop is steered off it afresh.
  context.repeats.stallRecovered();
  noProgress.cleared();
  return undefined;
}

/**
 * The ladder's next step once refusing has not worked, whether or not its
 * refusals came in a row (`./ladder-top.ts`): nothing while the loop goes on,
 * the caller's move to run, or how the round stops where its caller ends it.
 */
export function automationStudioLlmEvidenceLoopOverdue(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number): Extract<AutomationStudioLlmEvidenceRefusedRepeatNext, { kind: "stalled" | "end" | "recover" }> | undefined {
  const signal = context.loops.due();
  return signal ? automationStudioLlmEvidenceLadderTop(context, iteration, signal, undefined, iteration) : undefined;
}
