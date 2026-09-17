// What a reduced exploration is: the shortest sequence that still reaches the
// state success was observed in, the two predicates that bound it, and a
// receipt for every step that was removed.
//
// **The receipt is not decoration.** A reduction is a claim that most of what
// the loop did was unnecessary, and a claim like that is worth nothing if it
// cannot be checked. Every step in scope appears either in `actions` or in
// `dropped` with one of five reasons, so the two lists together account for the
// whole exploration and a reduction that quietly lost a step is a failing
// assertion rather than a shorter answer.
//
// **`stateChainIntact` is the honesty flag.** The reduction is derived from a
// chain of state digests, and the chain holds only when each step's recorded
// `stateBefore` is the previous step's `stateAfter`. A caller whose digest
// moves on its own -- a clock in the state, an unrelated agent changing
// something between steps -- breaks the chain, and a reduction computed over a
// broken chain may be missing a step that mattered. It is reported rather than
// thrown, because a reduction that is probably right is still worth having and
// a caller that cannot see the doubt would store it as though it were certain.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioExplorationStatePredicate } from "./state-predicate.ts";

/**
 * Why a step is not in the minimum sequence. Exhaustive: a step in scope that
 * is not kept carries exactly one of these.
 */
export const AUTOMATION_STUDIO_EXPLORATION_DROP_REASONS = Object.freeze([
  /** It happened after success was observed, so nothing about success needed it. */
  "after_success",
  /** It only looked. An observation cannot have produced a state. */
  "observation_only",
  /** It failed, was refused, or never ran, so it changed nothing. */
  "did_not_succeed",
  /** It ran and the state digest was the same afterwards. */
  "changed_nothing",
  /** It changed something and the state came back, so the change was undone. */
  "undone"
] as const);

export type AutomationStudioExplorationDropReason = (typeof AUTOMATION_STUDIO_EXPLORATION_DROP_REASONS)[number];

/** Core's own sentence for each reason. Never a model's. */
export const AUTOMATION_STUDIO_EXPLORATION_DROP_SENTENCE: Readonly<Record<AutomationStudioExplorationDropReason, string>> = Object.freeze({
  after_success: "The step came after success was observed, so the success did not depend on it.",
  observation_only: "The step only observed, so it cannot have produced the state success was observed in.",
  did_not_succeed: "The step did not run to a successful end, so it changed nothing to depend on.",
  changed_nothing: "The step ran and left the state exactly as it found it.",
  undone: "The state returned to what it had been before the step, so the step and what reversed it cancel out."
});

export type AutomationStudioExplorationDroppedStep = {
  /** Where it was in the exploration, so the receipt lines up with the trace. */
  index: number;
  actionId: string;
  reason: AutomationStudioExplorationDropReason;
};

export type AutomationStudioExplorationReducedStep = {
  /** Where it was in the exploration. A reduction never reorders. */
  index: number;
  actionId: string;
  /** The argument it was given, when the exploration recorded one. */
  input?: JsonObject;
};

export type AutomationStudioExplorationReduction = {
  schemaVersion: "automation-studio.exploration-reduction.v1";
  /** The minimum sequence, in the order the steps happened. */
  actions: readonly AutomationStudioExplorationReducedStep[];
  /** What must hold of the state before the first action runs. */
  inputState: AutomationStudioExplorationStatePredicate;
  /** What holds of the state once the last one has. */
  outputState: AutomationStudioExplorationStatePredicate;
  /** Every step in scope that is not in `actions`, and why. */
  dropped: readonly AutomationStudioExplorationDroppedStep[];
  /** How many steps the exploration took in total. */
  exploredSteps: number;
  /** The index of the step success was observed at. */
  successAt: number;
  /**
   * Whether every step's recorded starting state was the previous step's
   * finishing state. False means something moved the state between steps, and
   * the reduction may be missing a step the success depended on.
   */
  stateChainIntact: boolean;
};
