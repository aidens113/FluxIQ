// What the loop does about what the loop detector finds (`../repeat-guard/loop-detection/`).
//
// Every role that runs the evidence loop gets this, and no model is called for
// it. Before a call runs, the ladder may refuse it (`automationStudioLlmEvidenceLoopCheck`,
// through the same path as the repeat guard's refusals, `./refused-repeat.ts`).
// After it ran, the ladder may steer: the model is told as evidence, the person
// sees it as a step, and the run's record gets a row and a step folder
// (`automationStudioLlmEvidenceLoopRan`).
//
// **The last two steps of the ladder are the caller's.** A fresh context and a
// wait for a person need the single-loop path, so the loop only raises a typed
// signal (`input.loopSignal`). A caller that gives none keeps steer and refuse,
// and ends only the ways it always could: no signal is raised for it, and no new
// way for a task to end exists.
//
// A call this lets through still goes to `executeTool` and whatever gate stands
// behind it: nothing here grants anything, and a lasting act's refusal stays.

import type { JsonObject } from "../../../core/index.ts";
import { emitAutomationStudioActivity } from "../../activity/index.ts";
import { automationStudioFlowDraftDeclaresLasting, automationStudioFlowDraftStepWordsOf } from "../../flow-authoring/draft/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/supersede.ts";
import type { AutomationStudioLlmEvidenceLoopDecision, AutomationStudioLlmEvidenceLoopResult, AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop/index.ts";
import { automationStudioLlmEvidenceCallWritten, automationStudioLlmEvidenceRetriesLater, type AutomationStudioLlmEvidenceRepeatedOutcome } from "../repeat-guard/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_STEERED_CODE,
  automationStudioLlmLoopChatWords, automationStudioLlmLoopDigest, automationStudioLlmLoopMeaningfulInput, automationStudioLlmLoopRowBound, automationStudioLlmLoopRowDigests, automationStudioLlmLoopSteerNote, automationStudioLlmLoopStepFolder,
  type AutomationStudioLlmLoopAmendment, type AutomationStudioLlmLoopCall, type AutomationStudioLlmLoopFinding
} from "../repeat-guard/loop-detection/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";
import type { AutomationStudioLlmEvidenceRefusedRepeatNext } from "./refused-repeat.ts";

type ToolCall = Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>;

/** The earlier outcome a call refused on a finding is told about, in the repeat guard's own shape. */
function outcomeOf(finding: AutomationStudioLlmLoopFinding): AutomationStudioLlmEvidenceRepeatedOutcome {
  return { callId: finding.callId ?? "", outcome: finding.pattern as AutomationStudioLlmEvidenceRepeatedOutcome["outcome"], repeats: finding.repeats, toolIds: finding.toolIds };
}

/** Whether the ladder refuses this call before it runs. */
export function automationStudioLlmEvidenceLoopCheck(context: AutomationStudioLlmEvidenceDecisionHandlerContext, decision: ToolCall): AutomationStudioLlmEvidenceRepeatedOutcome | undefined {
  const finding = context.loops.check(decision.toolId, decision.input, context.contextOf(decision.toolId), context.repeats.state(), () => automationStudioFlowDraftStepWordsOf(context.input.describeCall, { toolId: decision.toolId, value: decision.input })?.target);
  return finding ? outcomeOf(finding) : undefined;
}

/** Whether the ladder refuses this edit before any of it runs. */
export function automationStudioLlmEvidenceLoopCheckAmendment(context: AutomationStudioLlmEvidenceDecisionHandlerContext, key: string, draftBefore: string): AutomationStudioLlmEvidenceRepeatedOutcome | undefined {
  const finding = context.loops.checkAmendment(key, draftBefore);
  return finding ? outcomeOf(finding) : undefined;
}

/** The digest an edit is known by to the detector: what it asks, free text out. */
export function automationStudioLlmEvidenceLoopAmendmentKey(amendments: unknown): string {
  return automationStudioLlmLoopDigest(automationStudioLlmLoopMeaningfulInput({ amendments } as JsonObject));
}

/** Tells the model and the person, and puts it on the run's record. */
function steer(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, finding: AutomationStudioLlmLoopFinding): void {
  const note = automationStudioLlmLoopSteerNote(finding, context.input.draft === false ? "undrafted" : "drafted", finding.pattern !== "same_act" || context.input.loopSignal !== undefined);
  context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(context.evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID);
  context.evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID, value: note });
  context.recordRow({ iteration, decision: "tool_call", toolId: finding.toolIds.at(-1) ?? AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID, resultCode: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_STEERED_CODE, resultReason: finding.pattern });
  automationStudioLlmLoopStepFolder(iteration, "steer", finding);
  const { title, text } = automationStudioLlmLoopChatWords(finding);
  emitAutomationStudioActivity({ phase: "thinking", label: title, detail: { kind: "thought", title, text, status: "succeeded" } });
}

/** Where a call left the work, from the page its route state names: a digest, compared for equality. Read by shape: a result with none has no place. */
function placeOf(returned: unknown): { placeAfter?: string } {
  const routeState = (returned as { routeState?: { page?: { location?: unknown } } } | null | undefined)?.routeState;
  const location = routeState?.page?.location;
  return typeof location === "string" ? { placeAfter: automationStudioLlmLoopDigest(location) } : {};
}

/** One call as the loop knows it once it has run. */
export type AutomationStudioLlmEvidenceLoopRanFacts = {
  decision: ToolCall;
  answer: Parameters<typeof automationStudioLlmLoopRowDigests>[0];
  execution: Pick<AutomationStudioLlmEvidenceToolExecutionResult, "effectApplied" | "resultCode" | "failure" | "personNeeded" | "ownRetestBound">;
  /** The result as the caller returned it: its route state, which the result's parser lists and never reads, is taken from here. */
  returned: unknown;
  effect: "observe" | "mutate";
  refused: boolean;
  stateBefore: string | undefined;
  stateAfter: string | undefined;
  /** Not the model's to be counted: a rerun, measured as its amendment, a check or a batch member. */
  notCounted: boolean;
  draftKey: string | undefined;
  /** What the call really ran with, which names its target by fingerprint where the input names it by handle. */
  ranWith: JsonObject | undefined;
  /** The domain's name for what the call acts on, asked before it ran. */
  targetWords: string | undefined;
};

/** A call ran: what it showed, the steer that follows from it, and how the round stops if refusing has already not worked. */
export function automationStudioLlmEvidenceLoopRan(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, facts: AutomationStudioLlmEvidenceLoopRanFacts): Extract<AutomationStudioLlmEvidenceRefusedRepeatNext, { kind: "stalled" | "end" | "recover" }> | undefined {
  const { decision, answer, execution, returned, effect, refused, stateBefore, stateAfter, notCounted, draftKey, ranWith, targetWords } = facts;
  const { finishingTools, planning, readRowsKey } = context.input;
  const rows = automationStudioLlmLoopRowDigests(answer, readRowsKey);
  const fix = finishingTools?.submit === decision.toolId;
  const call: AutomationStudioLlmLoopCall = {
    callId: decision.callId, toolId: decision.toolId, input: decision.input, context: context.contextOf(decision.toolId), stateBefore, stateAfter, effect,
    effectApplied: execution.effectApplied, refused, ...(rows ? { rows } : {}), answer: automationStudioLlmLoopDigest(answer), draftKey,
    ...(ranWith ? { ranAs: ranWith } : {}), ...(targetWords !== undefined ? { targetWords } : {}), ...placeOf(returned),
    // Stated lasting: what the call declared it would lastingly do, or an act of the instruction it says it does.
    ...(automationStudioFlowDraftDeclaresLasting(decision.input.consequences) || decision.act !== undefined ? { lasting: true } : {}),
    ...(decision.act !== undefined ? { act: decision.act } : {}), ...(decision.input.undoes !== undefined ? { undo: true } : {}), ...(automationStudioLlmLoopRowBound(decision.input) ? { rowBound: true } : {}),
    ...(fix ? { fix: true } : {}), ...(finishingTools?.test === decision.toolId ? { judges: true } : {}),
    ...((fix || planning?.toolIds.includes(decision.toolId)) && !refused ? { accepted: true } : {}),
    exempt: notCounted || execution.personNeeded === true || (execution.ownRetestBound === true && execution.effectApplied) || automationStudioLlmEvidenceRetriesLater(execution)
      || automationStudioLlmEvidenceCallWritten({ input: decision.input, refused, resultCode: execution.resultCode })
  };
  const state = stateBefore ?? context.repeats.state();
  const guarded = state !== undefined && context.repeats.blocks(decision.toolId, decision.input, state) !== undefined;
  const before = context.loops.tally();
  const finding = context.loops.ran(call, guarded);
  if (finding) steer(context, iteration, finding);
  else if (!context.loops.engaged()) automationStudioLlmDecisionContextSupersede(context.evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID);
  return before.steered === context.loops.tally().steered ? context.loopOverdue(iteration) : undefined;
}

/** An edit settled: the steer that follows from it, if any. */
export function automationStudioLlmEvidenceLoopAmended(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, amendment: AutomationStudioLlmLoopAmendment): void {
  const finding = context.loops.amended(amendment);
  if (finding) steer(context, iteration, finding);
}
