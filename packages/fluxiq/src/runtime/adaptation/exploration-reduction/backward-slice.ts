// The reduction itself: a backward slice from the observation that saw success,
// over a chain of opaque state digests.
//
// The problem it solves. A loop that explores a broken run wanders -- it looks
// at things, tries something, undoes it, looks again, and eventually does the
// one thing that worked. Everything it did is recorded, and all of it is
// recorded the same way, so what is left afterwards is a transcript of the
// wandering rather than the fix inside it. Replaying the transcript replays the
// wandering: the wrong move is made again, the undo is made again, and the run
// takes as long as the exploration did. Nothing durable is learned from a
// success, which is the whole point of having explored.
//
// The method. Success is observed in a state, and that state has a digest. Walk
// backwards asking one question at a time -- "what state must hold for this to
// work, and what is the earliest moment the exploration was in it?" -- and the
// answer is a chain of steps ending at the goal, with everything off the chain
// left behind.
//
// **Earliest, not latest, is the whole trick.** Both answer "which step
// produced this state", and only one of them reduces anything. Take the
// sequence this was built for: look, move the view, do the wrong thing, undo
// it, look again, do the right thing, wait. Undoing the wrong thing puts the
// state back to what it was before, so the state the correct step starts from
// held at two moments: once at the beginning, and again after the undo. Asking
// for the latest moment finds the undo, keeps it, then keeps the wrong step
// that made the undo necessary, and reduces nothing at all. Asking for the
// earliest finds the beginning, and the wrong step and its undo both fall
// outside the chain -- not because anything declared them a pair, but because
// the state came back, which is what an undo is. A domain-neutral reducer
// cannot recognise one action as the inverse of another; it can recognise that
// a state it had already been in has returned.
//
// **Two filters sit on top of the walk, and both are about what a step could
// possibly have caused.** An observation cannot have produced a state -- it
// only looked -- and a step that failed, was refused or never ran did not
// happen. Neither may be selected as the producer of anything, and either one
// found sitting where a producer should be is a broken chain rather than a kept
// step.
//
// **Nothing in here knows what is being automated.** A step is a name, an
// opaque argument, whether it looked or changed something, whether it worked,
// and two digests. That is what lets one reducer serve every domain: the
// reduction is a statement about a chain of state digests, and what sits on the
// other end of the digests is none of its business.

import {
  isAutomationStudioExplorationStepReplayable,
  type AutomationStudioExplorationStep
} from "./step.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_ANY_STATE,
  automationStudioExplorationStateDigestEquals
} from "./state-predicate.ts";
import type {
  AutomationStudioExplorationDropReason,
  AutomationStudioExplorationDroppedStep,
  AutomationStudioExplorationReducedStep,
  AutomationStudioExplorationReduction
} from "./reduction.ts";

export type AutomationStudioExplorationReductionInput = {
  /** The steps in the order they happened. */
  steps: readonly AutomationStudioExplorationStep[];
  /**
   * The step success was observed at. Everything after it is out of scope,
   * because the success cannot have depended on it. Defaults to the last step.
   */
  successAt?: number;
};

/**
 * The minimum sequence that reaches the state success was observed in, with the
 * predicates that bound it and a receipt for every step left out.
 *
 * Throws on a `successAt` outside the trace rather than clamping it into range:
 * the caller owns both the steps and the index, so an index that is not one of
 * them is its own bug, and quietly reducing a window the caller did not mean
 * would answer with a fix for a success that was never observed.
 */
export function reduceAutomationStudioExploration(input: AutomationStudioExplorationReductionInput): AutomationStudioExplorationReduction {
  const steps = input.steps;
  if (steps.length === 0) {
    if (input.successAt !== undefined) throw new RangeError("An exploration with no steps has no step at which success was observed.");
    return {
      schemaVersion: "automation-studio.exploration-reduction.v1",
      actions: [],
      inputState: AUTOMATION_STUDIO_EXPLORATION_ANY_STATE,
      outputState: AUTOMATION_STUDIO_EXPLORATION_ANY_STATE,
      dropped: [],
      exploredSteps: 0,
      successAt: -1,
      stateChainIntact: true
    };
  }
  const successAt = input.successAt ?? steps.length - 1;
  if (!Number.isInteger(successAt) || successAt < 0 || successAt >= steps.length) {
    throw new RangeError(`Success was said to be observed at step ${String(input.successAt)}, and the exploration has ${steps.length} step(s).`);
  }

  // Moment zero is before the first step; moment m, for m above zero, is after
  // step m - 1. The walk asks when a state first held, so moments are what it
  // searches rather than steps.
  const scope = successAt + 1;
  const digestAtMoment = (moment: number): string => (moment === 0 ? steps[0]!.stateBefore : steps[moment - 1]!.stateAfter);
  const firstMomentOf = new Map<string, number>();
  for (let moment = 0; moment <= scope; moment += 1) {
    const digest = digestAtMoment(moment);
    if (!firstMomentOf.has(digest)) firstMomentOf.set(digest, moment);
  }

  let chainIntact = true;
  for (let index = 1; index < scope; index += 1) {
    if (steps[index]!.stateBefore !== steps[index - 1]!.stateAfter) chainIntact = false;
  }

  const kept = new Set<number>();
  let needed = steps[successAt]!.stateAfter;
  let bound = scope;
  for (;;) {
    const moment = firstMomentOf.get(needed);
    if (moment === undefined || moment > bound) {
      // The state the chain asks for never held during the exploration, which
      // can only happen once something has moved the state out from under the
      // recorded steps. Stop, and say the chain is broken.
      chainIntact = false;
      break;
    }
    // The state was already what is needed before anything ran, so nothing
    // earlier is required and the walk is finished.
    if (moment === 0) break;
    const producer = moment - 1;
    if (isAutomationStudioExplorationStepReplayable(steps[producer]!)) kept.add(producer);
    // A step that only observed, or that did not succeed, cannot have produced
    // a state -- so one sitting where a producer should be means the digest
    // moved for a reason the trace does not record.
    else chainIntact = false;
    needed = steps[producer]!.stateBefore;
    bound = producer;
  }

  const actions: AutomationStudioExplorationReducedStep[] = [];
  const dropped: AutomationStudioExplorationDroppedStep[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    if (kept.has(index)) {
      actions.push({ index, actionId: step.actionId, ...(step.input ? { input: step.input } : {}) });
      continue;
    }
    dropped.push({ index, actionId: step.actionId, reason: dropReason(step, index, successAt) });
  }

  return {
    schemaVersion: "automation-studio.exploration-reduction.v1",
    actions,
    inputState: automationStudioExplorationStateDigestEquals(needed),
    outputState: automationStudioExplorationStateDigestEquals(steps[successAt]!.stateAfter),
    dropped,
    exploredSteps: steps.length,
    successAt,
    stateChainIntact: chainIntact
  };
}

/**
 * Why one step is not in the minimum sequence.
 *
 * The order is how much each reason explains. Being an observation is a fact
 * about the step whatever else is true of it, so it is tested before whether
 * the step succeeded; `undone` is last because it is the only reason that is
 * not a property of the step at all, but of what happened after it.
 */
function dropReason(step: AutomationStudioExplorationStep, index: number, successAt: number): AutomationStudioExplorationDropReason {
  if (index > successAt) return "after_success";
  if (step.effect === "observe") return "observation_only";
  if (step.outcome !== "succeeded") return "did_not_succeed";
  if (step.stateBefore === step.stateAfter) return "changed_nothing";
  return "undone";
}
