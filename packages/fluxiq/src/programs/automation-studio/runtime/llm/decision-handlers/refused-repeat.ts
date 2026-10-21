// A call refused before it runs, because the same call already failed or
// changed nothing on this same page (`../repeat-guard/outcomes.ts`).
//
// The decision is recorded as refused, the model is told what happened then
// and what to do instead, and the no-progress guard counts it. Refused repeats
// in a row end the round as a stall (`AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW`):
// a build then tests and judges the Flow so far, and repairs it or says why it
// cannot be done (`../../flow-bootstrap/unfinished-build/phases.ts`). In
// candidate mode (`discoveryOnly`) there is no draft to test, so a refused
// call's stall asks the caller first for a move that may still get the build
// further -- the retest of its latest revision -- and runs that instead
// (`./stall-recovery.ts`, t477); with none left the build ends, and the note
// never names the draft (`../repeat-guard/candidate-feedback.ts`). Never an
// endless loop, and never silent.

import { automationStudioFlowDraftStepCopy } from "../../flow-draft/index.ts";
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
import { automationStudioLlmEvidenceStallRecovery, type AutomationStudioLlmEvidenceStallOutcome } from "./stall-recovery.ts";
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
  const inARow = context.repeats.refusedAgain(iteration);
  const stop = automationStudioLlmEvidenceRepeatStop(context, inARow, undefined, iteration);
  if (stop) return stop;
  // A loop that drafts nothing -- a project's supervisor, a reset -- is never told a Flow so far is tested and judged (t591).
  const candidate = context.input.discoveryOnly === true;
  const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: decision.toolId, earlier, inARow, candidate, undrafted: !candidate && context.input.draft === false });
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
  issueCode?: string
): Extract<AutomationStudioLlmEvidenceRefusedRepeatNext, { kind: "stalled" | "end" }> | undefined;
/**
 * The same, for a caller that can run a call: given the iteration, a stall
 * first asks the loop's caller for a move that may still get the build further
 * (`./stall-recovery.ts`), and answers that call to run instead.
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
  const { input, trace, accounting, draftSteps, noProgress } = context;
  noProgress.stepped();
  if (inARow < AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW && !noProgress.reached()) return undefined;
  if (input.unusableDecisions) {
    const stall = recoverAt === undefined ? { kind: "stall" as const, issueCodes: [issueCode] } : automationStudioLlmEvidenceStallRecovery(context, recoverAt, [issueCode]);
    if (stall.kind === "recover") return stall;
    // The caller is asked to recover with the guard's codes alone; the stall it ends under also names the refusal the repeats followed (t748).
    return { kind: "stalled", error: input.unusableDecisions.stalled({ issueCodes: [...stall.issueCodes, ...lastRefusal(context)], trace: [...trace], accounting: { ...accounting }, steps: draftSteps.map((step) => automationStudioFlowDraftStepCopy(step)) }) };
  }
  return { kind: "end", result: failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting) };
}

/**
 * The prefix a stall carries the last refusal before its repeats under, as
 * `<prefix><code>` (t748). A run of refused repeats is a symptom: in live run
 * `run-mvgw7320-de416190` a reset brief's press was refused by Core, and the
 * builder asked one look again until this guard ended the brief, whose stall
 * then named only the guard. The supervisor's brief return
 * (`../../project-agents/dispatch/ending.ts`) and the debug read the stall's
 * codes; this one says which answer stranded the builder. Nothing more is refused.
 */
const LAST_REFUSAL = "llm_evidence_loop.last_refusal:";

/** The newest call or look the history records as refused under a code of its own (not a refused repeat), as one code, or none. */
function lastRefusal(context: AutomationStudioLlmEvidenceDecisionHandlerContext): string[] {
  const records = context.history.records();
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const decision = records[index]!.decision;
    if ((decision.kind !== "call" && decision.kind !== "look") || decision.refused !== true) continue;
    const code = decision.resultCode;
    if (code && code !== "ok" && code !== AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE) return [`${LAST_REFUSAL}${code}`];
  }
  return [];
}
