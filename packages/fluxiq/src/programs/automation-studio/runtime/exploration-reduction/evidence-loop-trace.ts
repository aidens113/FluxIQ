// Reading Phase 2.3's exploration trace as steps the reducer can slice, and
// saying plainly what that trace does not carry.
//
// This exists so that the reduction reads the trace the exploration runner
// actually produces -- `AutomationStudioRuntimeExploration.trace`, whose entries
// are `AutomationStudioLlmEvidenceLoopTrace` -- rather than a second, parallel
// record of the same exploration written for the reducer's convenience. Two
// records of one run is how they come to disagree.
//
// **The trace carries three of the five things a reduction needs.** It says
// which action was called and in what order (`toolId`, `iteration`), it says
// whether the action ran at all (a `tool_call` entry the loop answered itself
// carries no `callId`), and whether a mutation applied (`effectApplied`). The
// tool table beside it says whether each action observes or changes something.
//
// **It carries neither of the other two, and neither can be invented here.**
//
//   1. *The state before and after each step.* The runner does compute a
//      digest per step, but it is a digest of the evidence the step returned,
//      it is used inside the budget ledger to notice a repeat, and it never
//      reaches the trace. Evidence is what the step said, and the reduction
//      needs what the world was: a step that returns the same bytes twice may
//      have changed something both times, and a step that returns new bytes
//      may have changed nothing. So the caller supplies the two digests, and
//      the step it cannot supply them for is reported as a gap rather than
//      guessed at.
//
//   2. *The argument the action was given.* The runner builds a signature from
//      it for repeat detection and keeps the signature, not the value, so the
//      trace names the action and not what it was asked to do. A reduced
//      sequence that cannot be run again is not a fix, so the argument comes
//      from the same caller-supplied lookup.
//
// Both are real gaps in the 2.3 contract rather than shortcomings of this
// adapter, and the gap list is what a caller reads to find out how much of its
// exploration the reduction could actually see.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopTrace, AutomationStudioLlmEvidenceTool } from "../llm/index.ts";
import type { AutomationStudioExplorationStep, AutomationStudioExplorationStepOutcome } from "./step.ts";

/** What the caller knows about a step that the exploration trace does not record. */
export type AutomationStudioExplorationStepState = {
  /** A digest of the whole state before the step ran. */
  before: string;
  /** The same digest taken after it. */
  after: string;
  /** The argument the action was given, so a kept step can be run again. */
  input?: JsonObject;
};

/**
 * How the caller answers, for one trace entry, what the trace left out.
 *
 * Keyed on the iteration rather than the call id, because an entry the loop
 * answered from what it already held carries no call id and is still a step the
 * receipt should account for.
 */
export type AutomationStudioExplorationStateSource = (step: {
  iteration: number;
  actionId: string;
  callId?: string;
}) => AutomationStudioExplorationStepState | undefined;

/** Why a trace entry could not become a step. */
export const AUTOMATION_STUDIO_EXPLORATION_TRACE_GAPS = Object.freeze([
  /** A completion or an unusable provider answer. No action was taken. */
  "not_an_action",
  /** The action is not in the tool table, so whether it changes anything is unknown. */
  "unknown_action",
  /** The caller could supply no state digests, so the step cannot be placed on the chain. */
  "no_state_digests"
] as const);

export type AutomationStudioExplorationTraceGap = (typeof AUTOMATION_STUDIO_EXPLORATION_TRACE_GAPS)[number];

export type AutomationStudioExplorationTraceGapEntry = {
  iteration: number;
  actionId?: string;
  reason: AutomationStudioExplorationTraceGap;
};

/**
 * The loop's own codes for a request it declined to run again.
 *
 * The action never reached the domain, so nothing changed, and calling such a
 * step `failed` would put a defect where there was a guard working correctly.
 */
const NOT_RUN_RESULT_CODES: ReadonlySet<string> = new Set([
  "llm_evidence_loop.already_answered",
  "llm_evidence_loop.already_observed",
  "llm_evidence_loop.rejected.repeat_without_progress"
]);

export type AutomationStudioExplorationStepsFromTraceInput = {
  /** `AutomationStudioRuntimeExploration.trace`, in order. */
  trace: readonly AutomationStudioLlmEvidenceLoopTrace[];
  /** The tool table the exploration ran with, for each action's declared effect. */
  tools: readonly AutomationStudioLlmEvidenceTool[];
  /** What the trace does not carry, from whoever ran the exploration. */
  stateSource: AutomationStudioExplorationStateSource;
  /**
   * How a domain reads its own result codes. Core cannot read them and must
   * not learn to: the code is the domain's, and only the domain knows whether
   * it means refused or merely unremarkable. Returning nothing leaves the step
   * classified by the loop's own facts.
   */
  classifyOutcome?: (resultCode: string) => AutomationStudioExplorationStepOutcome | undefined;
};

/** The exploration's steps, and every trace entry that could not become one. */
export function automationStudioExplorationStepsFromTrace(input: AutomationStudioExplorationStepsFromTraceInput): {
  steps: AutomationStudioExplorationStep[];
  gaps: AutomationStudioExplorationTraceGapEntry[];
} {
  const effectOf = new Map(input.tools.map((tool) => [tool.toolId, tool.effect ?? "observe"] as const));
  const steps: AutomationStudioExplorationStep[] = [];
  const gaps: AutomationStudioExplorationTraceGapEntry[] = [];
  for (const entry of input.trace) {
    if (entry.decision !== "tool_call" || entry.toolId === undefined) {
      gaps.push({ iteration: entry.iteration, reason: "not_an_action" });
      continue;
    }
    const actionId = entry.toolId;
    const effect = effectOf.get(actionId);
    if (effect === undefined) {
      gaps.push({ iteration: entry.iteration, actionId, reason: "unknown_action" });
      continue;
    }
    const state = input.stateSource({ iteration: entry.iteration, actionId, ...(entry.callId ? { callId: entry.callId } : {}) });
    if (!state) {
      gaps.push({ iteration: entry.iteration, actionId, reason: "no_state_digests" });
      continue;
    }
    steps.push({
      actionId,
      effect,
      outcome: outcomeOf(entry, input.classifyOutcome),
      stateBefore: state.before,
      stateAfter: state.after,
      ...(state.input ? { input: state.input } : {})
    });
  }
  return { steps, gaps };
}

/**
 * Whether one recorded step happened.
 *
 * The loop's own codes come first because they are facts rather than readings:
 * they say the action never reached the domain at all, and no domain opinion
 * about a code it never saw can be more informative than that. The domain's
 * reading comes next, and a mutation the domain reported as not applied is the
 * fallback, because `effectApplied: false` says a change was asked for and did
 * not happen without saying why.
 */
function outcomeOf(
  entry: AutomationStudioLlmEvidenceLoopTrace,
  classifyOutcome: ((resultCode: string) => AutomationStudioExplorationStepOutcome | undefined) | undefined
): AutomationStudioExplorationStepOutcome {
  if (entry.resultCode !== undefined && NOT_RUN_RESULT_CODES.has(entry.resultCode)) return "not_run";
  if (entry.callId === undefined) return "not_run";
  const classified = entry.resultCode === undefined ? undefined : classifyOutcome?.(entry.resultCode);
  if (classified) return classified;
  if (entry.effectApplied === false) return "failed";
  return "succeeded";
}
