// One step of an exploration, as the reducer is willing to read it.
//
// The loop that explores a broken run already records what it did: Phase 2.3's
// `AutomationStudioLlmEvidenceLoopTrace` carries an iteration, which tool was
// called, how many bytes came back and a domain result code. That is enough to
// bill a run and to say why it stopped. It is not enough to work out which of
// those steps actually mattered, because it never says what the world looked
// like before and after each one -- and without that, a step that changed
// something and a step that changed nothing are the same row.
//
// So this is the trace plus the two things the reduction cannot be done
// without, and nothing else:
//
//   - `effect`   -- whether the step only looked, or changed something. The
//                   evidence loop's tool table already declares this per tool;
//                   the adapter copies it onto the step.
//   - `outcome`  -- whether it happened. Four values, not a boolean, because a
//                   step that failed, one that was refused and one the loop
//                   answered from what it already held are three different
//                   facts about why nothing changed.
//   - `stateBefore` / `stateAfter` -- an opaque digest of the whole state, as
//                   the caller computes it. Core compares them and never reads
//                   them.
//
// **A step is opaque.** `actionId` is a name Core does not interpret and
// `input` is the argument it was given, carried so a reduced sequence can be
// replayed. Nothing here knows what kind of thing is being automated, and that
// is the property that lets one reducer serve every domain: the reduction is a
// statement about a chain of state digests, not about what produced them.

import type { JsonObject } from "../../../../core/index.ts";

/**
 * Whether a step only read the state or changed it.
 *
 * The same two words the evidence loop's tool table uses, deliberately: a
 * second vocabulary for the same distinction is how the two come to disagree
 * about one tool.
 */
export type AutomationStudioExplorationStepEffect = "observe" | "mutate";

/**
 * Whether the step happened, and if not, why not.
 *
 * `succeeded` is the only one the reduction can keep. The other three are kept
 * apart because they are three different things to do about a step that
 * contributed nothing: a `failed` step is a defect, a `refused` one is a policy
 * boundary, and a `not_run` one is the loop declining to repeat itself.
 */
export const AUTOMATION_STUDIO_EXPLORATION_STEP_OUTCOMES = Object.freeze([
  /** It ran and did what it was asked. */
  "succeeded",
  /** It ran and did not. */
  "failed",
  /** Something declined to let it run. */
  "refused",
  /** It never ran: the loop answered the request from what it already held. */
  "not_run"
] as const);

export type AutomationStudioExplorationStepOutcome = (typeof AUTOMATION_STUDIO_EXPLORATION_STEP_OUTCOMES)[number];

export type AutomationStudioExplorationStep = {
  /** What was done. An opaque name; Core never interprets it. */
  actionId: string;
  /** The argument it was given, carried so a kept step can be run again. */
  input?: JsonObject;
  effect: AutomationStudioExplorationStepEffect;
  outcome: AutomationStudioExplorationStepOutcome;
  /** A digest of the whole state before the step. Opaque, compared only for equality. */
  stateBefore: string;
  /** The same digest taken after it. */
  stateAfter: string;
};

/** Whether a step could have produced a state the success depends on. */
export function isAutomationStudioExplorationStepReplayable(step: AutomationStudioExplorationStep): boolean {
  return step.effect === "mutate" && step.outcome === "succeeded" && step.stateBefore !== step.stateAfter;
}
