// Running the whole draft again, once, with nothing attached to it.
//
// The reset, then every step the draft proposes, in order, each through the
// same executor an ordinary tool call goes through -- so each one passes the
// same permission gate, and none of them reaches a provider. The loop keeps its
// own bookkeeping out of here: this makes the calls and reports what came back,
// and `evidence-loop.ts` decides what the verdict does to the build.
//
// **Nothing here is counted as a tool call.** The loop's `maxToolCalls` and
// `minToolCalls` bound what the *model* asked for, and a replay is what Core
// asked for. Counting these would end long builds early and would make a
// refused dry run cost the model the calls it needs to fix it.
//
// **A step that comes back unreadable is a failed step**, never a skipped one.
// A host that does not implement the replay answers something this cannot read,
// and the honest reading of that is "this step was not demonstrably run again",
// which refuses the proposal rather than waving it through.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftReplayFrom,
  automationStudioFlowDraftStepIsProposed,
  type AutomationStudioFlowDraftDryRun,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import {
  AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES,
  automationStudioNodeReplayResetCall,
  automationStudioNodeReplayStatus,
  automationStudioNodeReplayStepCall,
  automationStudioNodeReplayToolId
} from "./replay.ts";

/** What the caller has to lend a replay: the executor, and how to bound it. */
export type AutomationStudioFlowDraftReplayInput = {
  steps: readonly AutomationStudioFlowDraftStep[];
  /** 1 for the first replay of this build. */
  attempt: number;
  /** Steps already put to the model as unreproducible (`../../flow-draft/dry-run.ts`). */
  asked: ReadonlySet<string>;
  /** What one replayed step's evidence may cost, the same bound a tool call gets. */
  maxEvidenceBytes: number;
  executeTool(input: { callId: string; toolId: string; value: JsonObject; maxEvidenceBytes: number; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  signal?: AbortSignal;
};

/** A replay, and the one piece of evidence worth showing the model afterwards. */
export type AutomationStudioFlowDraftReplayResult = {
  verdict: AutomationStudioFlowDraftDryRun;
  /**
   * What the first step that did not replay left behind, when it left anything.
   *
   * One, not all of them: the first failure is what has to be understood, the
   * rest are usually its consequences, and the model is about to be asked
   * again with a window that has to hold everything else it knows. This is the
   * page as it was *when the replay broke*, which is what a correction needs.
   */
  evidence?: { callId: string; toolId: string; value: JsonValue };
};

/** Run the draft again, from the state its first step found. */
export async function replayAutomationStudioFlowDraft(input: AutomationStudioFlowDraftReplayInput): Promise<AutomationStudioFlowDraftReplayResult> {
  const proposed = input.steps.filter(automationStudioFlowDraftStepIsProposed);
  const from = automationStudioFlowDraftReplayFrom(input.steps);
  const outcomes: AutomationStudioFlowDraftReplayOutcome[] = [];
  const first = proposed[0];
  if (!from || !first) return { verdict: verdictOf(input, "failed", outcomes) };
  const resetCallId = `dryrun.${input.attempt}.reset`;
  const reset = await call(input, resetCallId, automationStudioNodeReplayToolId(first), automationStudioNodeReplayResetCall(from));
  if (!reset.readable || reset.result.resultCode === AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.resetFailed || reset.result.effectApplied !== true) {
    return {
      verdict: verdictOf(input, "failed", outcomes),
      ...(reset.readable ? { evidence: { callId: resetCallId, toolId: automationStudioNodeReplayToolId(first), value: reset.result.evidence } } : {})
    };
  }
  let evidence: AutomationStudioFlowDraftReplayResult["evidence"];
  for (const step of proposed) {
    const value = automationStudioNodeReplayStepCall(step);
    const callId = `dryrun.${input.attempt}.${step.position}`;
    const toolId = automationStudioNodeReplayToolId(step);
    // A step with nothing to run it with is a failed step, not a skipped one.
    const ran: ReplayAnswer = value ? await call(input, callId, toolId, value) : { readable: false };
    const status = ran.readable ? automationStudioNodeReplayStatus(ran.result.resultCode) : "failed";
    outcomes.push({ step: step.position, actionId: step.actionId, status, ...(ran.readable && ran.result.resultCode ? { resultCode: ran.result.resultCode } : {}) });
    if (status === "replayed") continue;
    // The first thing that did not replay is the one worth showing, and the
    // rest of the steps are still run: a verdict that stops at the first
    // failure cannot tell one broken step from a draft that stopped making
    // sense halfway, and the difference is what the model needs.
    if (!evidence && ran.readable) evidence = { callId, toolId, value: ran.result.evidence };
  }
  return { verdict: verdictOf(input, "ok", outcomes), ...(evidence ? { evidence } : {}) };
}

function verdictOf(
  input: AutomationStudioFlowDraftReplayInput,
  reset: "ok" | "failed",
  outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]
): AutomationStudioFlowDraftDryRun {
  return automationStudioFlowDraftDryRunVerdict({ attempt: input.attempt, reset, outcomes, asked: input.asked });
}

/**
 * What one replay call answered.
 *
 * `unreadable` is named rather than left as an absent answer, because the two
 * are different findings and a reader of this code has to see which one it is
 * looking at: a call that came back with something this cannot parse, and a
 * call that threw, are both "this step was not demonstrably run again" -- which
 * the verdict reads as a failed step, refusing the proposal. An absent value
 * here would read as "there was nothing to check", which is the opposite.
 */
type ReplayAnswer =
  | { readable: true; result: NonNullable<ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>> }
  | { readable: false };

/**
 * One replay call.
 *
 * A throw is not swallowed: the permission gate raising a request throws here,
 * and the run has to stop rather than record a step as having failed to replay.
 * So a cancelled run re-throws, and everything else is an unreadable answer.
 */
async function call(
  input: AutomationStudioFlowDraftReplayInput,
  callId: string,
  toolId: string,
  value: JsonObject
): Promise<ReplayAnswer> {
  try {
    const ran = await input.executeTool({ callId, toolId, value, maxEvidenceBytes: input.maxEvidenceBytes, ...(input.signal ? { signal: input.signal } : {}) });
    const result = automationStudioLlmEvidenceParseToolExecutionResult(ran, "mutate");
    return result ? { readable: true, result } : { readable: false };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return { readable: false };
  }
}
