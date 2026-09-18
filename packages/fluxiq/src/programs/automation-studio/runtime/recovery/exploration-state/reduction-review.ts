// Reducing a finished exploration to the path that worked, and saying whether
// the answer may be acted on.
//
// The reducer is honest about its own doubt and reports it rather than throwing
// (`stateChainIntact`), which means the doubt is only worth having if somebody
// reads it. This is where it is read. A reduction computed over a chain with a
// hole in it is still a useful receipt -- it accounts for every step the
// exploration took -- and it is not a fix, so the two are kept apart by a flag
// with a Core-authored sentence beside it rather than by a caller's judgement.
//
// **Three different things make a reduction unusable, and they are all here.**
//
//   1. *The chain is broken.* Either something moved the state between two
//      steps, or a step that Core was told only observes sits exactly where a
//      state change must have come from. The second is the more likely one and
//      it is a configuration defect rather than an accident: an action with no
//      declared `effect` defaults to `observe`, so a mutating action whose tool
//      table forgot to say so is dropped from every reduction, and the
//      reduction then reports a state it cannot account for. Core cannot tell
//      the two apart -- both are "the digest moved for a reason the record does
//      not contain" -- so the sentence names both.
//
//   2. *A step could not be read at all.* An action missing from the tool
//      table, or one whose state nobody could digest, never becomes a step, so
//      the chain the reducer walked was not the exploration that happened. The
//      reduction may be short by exactly the step that mattered.
//
//   3. *Nothing observed the state.* With no digest source bound there are no
//      steps, and the reducer's honest answer to an empty exploration --
//      "nothing is needed, from any state" -- would read as a fix that does
//      nothing. It is not published as one.
//
// A trace entry that was never an action -- a completion, an unusable provider
// answer -- is not a gap in this sense and does not count against the answer.

import type { AutomationStudioLlmEvidenceLoopTrace, AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import {
  automationStudioExplorationStepsFromTrace,
  reduceAutomationStudioExploration,
  type AutomationStudioExplorationReduction,
  type AutomationStudioExplorationStepOutcome,
  type AutomationStudioExplorationTraceGapEntry
} from "../../exploration-reduction/index.ts";
import type { AutomationStudioExplorationStateDigestFailure } from "./digest-source.ts";
import type { AutomationStudioExplorationStepRecord } from "./step-record.ts";

export type AutomationStudioExplorationReductionReview = {
  /**
   * The minimum sequence and its receipt, when the exploration could be read as
   * a chain at all. Absent means no step could be placed on one.
   */
  reduction?: AutomationStudioExplorationReduction;
  /** Every trace entry that could not become a step, and why. */
  gaps: readonly AutomationStudioExplorationTraceGapEntry[];
  /**
   * Whether the sequence may be replayed as a fix. False leaves `reduction` a
   * receipt for what the exploration did and nothing more.
   */
  replayable: boolean;
  /** Core's own sentence for the verdict. Never a model's. */
  reason: string;
};

export type AutomationStudioExplorationReductionReviewInput = {
  /** The exploration's trace, in order. */
  trace: readonly AutomationStudioLlmEvidenceLoopTrace[];
  /** The tool table it ran with, for each action's declared effect. */
  tools: readonly AutomationStudioLlmEvidenceTool[];
  /** What the runner recorded per step: the argument, and the state either side. */
  steps: readonly AutomationStudioExplorationStepRecord[];
  /** Whether anything was bound to say what the state was. */
  observedState: boolean;
  /** Moments whose digest threw, so a gap can say it was not merely absent. */
  digestFailures?: readonly AutomationStudioExplorationStateDigestFailure[];
  /** How the domain reads its own result codes, when it can. */
  classifyOutcome?: (resultCode: string) => AutomationStudioExplorationStepOutcome | undefined;
};

/** The reduction of one finished exploration, with the verdict on whether it may be used. */
export function reviewAutomationStudioExplorationReduction(
  input: AutomationStudioExplorationReductionReviewInput
): AutomationStudioExplorationReductionReview {
  const failures = input.digestFailures ?? [];
  if (!input.observedState) {
    return { gaps: [], replayable: false, reason: "Nothing was bound to say what the state was during the exploration, so there is no chain of states to reduce along and no sequence to replay." };
  }
  const byCallId = new Map(input.steps.map((step) => [step.callId, step] as const));
  const { steps, gaps } = automationStudioExplorationStepsFromTrace({
    trace: input.trace,
    tools: input.tools,
    stateSource: (step) => {
      const record = step.callId === undefined ? undefined : byCallId.get(step.callId);
      if (!record || record.stateBefore === undefined || record.stateAfter === undefined) return undefined;
      return { before: record.stateBefore, after: record.stateAfter, input: record.input };
    },
    ...(input.classifyOutcome ? { classifyOutcome: input.classifyOutcome } : {})
  });
  const unread = gaps.filter((gap) => gap.reason !== "not_an_action");
  if (steps.length === 0) {
    return { gaps, replayable: false, reason: `No step of the exploration could be placed on a chain of states${unreadDetail(unread, failures)}, so there is no sequence to replay.` };
  }
  const reduction = reduceAutomationStudioExploration({ steps });
  if (!reduction.stateChainIntact) {
    return { reduction, gaps, replayable: false, reason: "The exploration's recorded states do not form one chain: either something changed the state between two steps, or an action declared as only observing is where a state change came from. The shortest sequence may be missing the step the success depended on, so it is kept as a receipt and must not be replayed." };
  }
  if (unread.length) {
    return { reduction, gaps, replayable: false, reason: `The reduction could not read ${unread.length} step(s) of the exploration${unreadDetail(unread, failures)}, so the shortest sequence may be missing one of them. It is kept as a receipt and must not be replayed.` };
  }
  return { reduction, gaps, replayable: true, reason: `Every one of the ${reduction.exploredSteps} step(s) was recorded and the states form one chain, so the ${reduction.actions.length} action(s) kept are the sequence that reached the state success was observed in.` };
}

/** Why steps went unread, in Core's words, or nothing when none did. */
function unreadDetail(
  unread: readonly AutomationStudioExplorationTraceGapEntry[],
  failures: readonly AutomationStudioExplorationStateDigestFailure[]
): string {
  if (!unread.length) return "";
  const unknown = unread.filter((gap) => gap.reason === "unknown_action").length;
  const undigested = unread.length - unknown;
  const parts: string[] = [];
  if (unknown) parts.push(`${unknown} named an action the tool table does not declare`);
  if (undigested) parts.push(`${undigested} had no state digest${failures.length ? `, and ${failures.length} digest(s) were asked for and threw` : ""}`);
  return ` (${parts.join("; ")})`;
}
