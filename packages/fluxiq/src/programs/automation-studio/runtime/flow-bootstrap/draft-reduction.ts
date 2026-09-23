// Reading a build's draft through the exploration reducer.
//
// The reducer this calls was written for exactly this problem and, until now,
// was wired only to the repair path. `runtime/exploration-reduction/` takes a
// list of steps -- an action, its argument, whether it looked or changed
// something, whether it worked, and a state digest either side -- and returns
// the shortest sequence that still reaches the state success was observed in,
// with a receipt naming one of five reasons for every step it left out. That
// is, almost word for word, the list of steps a built result should contain,
// and nothing under this directory imported it.
//
// It could not be wired before because the evidence loop's trace carried
// neither of the two things the reducer cannot work without: the argument each
// action was given, and a digest of the state either side of it. The adapter's
// own header says so. The loop now keeps both on the draft it accrues, so this
// module is the join: the draft answers what the trace does not carry, and the
// reducer reads the trace it always meant to read.
//
// **Two bases, and the difference is honesty about digests.** With a digest
// either side of every step, the reduction runs and its receipt says why each
// dropped step was dropped. Without them -- the caller took none, or took some
// -- nothing can be said about which step produced which state, so the answer
// is every step that changed something and was not withdrawn, in the order it
// happened. That list is longer than the minimum and it is never wrong about
// what was done, which is the property the failure this replaces lacked.

import {
  automationStudioExplorationStepsFromTrace,
  reduceAutomationStudioExploration,
  type AutomationStudioExplorationReduction,
  type AutomationStudioExplorationStepOutcome,
  type AutomationStudioExplorationTraceGapEntry
} from "../exploration-reduction/index.ts";
import { automationStudioFlowDraftProposedSteps, type AutomationStudioFlowDraft, type AutomationStudioFlowDraftStep } from "../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopTrace, AutomationStudioLlmEvidenceTool } from "../llm/index.ts";

/** Where a reduced draft's steps came from. */
export type AutomationStudioFlowBootstrapDraftBasis =
  /** Every step that changed something and was not withdrawn, in order. */
  | "accrual"
  /** The minimum sequence the reducer found, over a complete digest chain. */
  | "reduction";

export type AutomationStudioFlowBootstrapDraftReduction = {
  /** The steps a built result should contain, in the order they happened. */
  steps: readonly AutomationStudioFlowDraftStep[];
  basis: AutomationStudioFlowBootstrapDraftBasis;
  /** The receipt, present only on the `reduction` basis. */
  reduction?: AutomationStudioExplorationReduction;
  /** Trace entries the adapter could not read as steps, and why. */
  gaps: readonly AutomationStudioExplorationTraceGapEntry[];
};

/**
 * The steps a build's result should contain, reduced where the draft carries
 * the digests to reduce over.
 *
 * `classifyOutcome` is the domain's reading of its own result codes, passed
 * straight through: Core cannot read them and must not learn to.
 */
export function reduceAutomationStudioFlowBootstrapDraft(input: {
  draft: AutomationStudioFlowDraft;
  trace: readonly AutomationStudioLlmEvidenceLoopTrace[];
  tools: readonly AutomationStudioLlmEvidenceTool[];
  classifyOutcome?: (resultCode: string) => AutomationStudioExplorationStepOutcome | undefined;
}): AutomationStudioFlowBootstrapDraftReduction {
  const accrued = automationStudioFlowDraftProposedSteps(input.draft);
  const byIteration = new Map(input.draft.steps.map((step) => [iterationKey(step.iteration, step.callId), step] as const));
  // The draft steps, in the order the adapter asked about them. The adapter
  // appends one step for each answer it gets, so the two lists line up -- and
  // the lengths are checked below rather than trusted, because a mapping that
  // slipped by one would keep the wrong steps with every gate green.
  const asked: AutomationStudioFlowDraftStep[] = [];
  const read = automationStudioExplorationStepsFromTrace({
    trace: input.trace,
    tools: input.tools,
    ...(input.classifyOutcome ? { classifyOutcome: input.classifyOutcome } : {}),
    stateSource: (entry) => {
      const step = byIteration.get(iterationKey(entry.iteration, entry.callId));
      if (!step || step.stateBefore === undefined || step.stateAfter === undefined) return undefined;
      asked.push(step);
      return { before: step.stateBefore, after: step.stateAfter, ...(step.input ? { input: step.input } : {}) };
    }
  });
  if (!read.steps.length || read.steps.length !== asked.length || read.gaps.some((gap) => gap.reason === "no_state_digests")) {
    return { steps: accrued, basis: "accrual", gaps: read.gaps };
  }
  const reduction = reduceAutomationStudioExploration({ steps: read.steps });
  const kept = reduction.actions.flatMap((action) => {
    const step = asked[action.index];
    return step ? [step] : [];
  });
  if (kept.length !== reduction.actions.length) return { steps: accrued, basis: "accrual", gaps: read.gaps };
  return { steps: kept, basis: "reduction", reduction, gaps: read.gaps };
}

/** One step's place in the trace: the iteration, and the call when it ran. */
function iterationKey(iteration: number, callId?: string): string {
  return `${iteration}\u0000${callId ?? ""}`;
}
