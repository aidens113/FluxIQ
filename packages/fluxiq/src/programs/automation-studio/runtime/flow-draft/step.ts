// One step of a draft: an action the loop took, as it happened.
//
// The draft exists because authoring used to be a separate act from exploring.
// A loop explored, and then, at the end, the model wrote down what it
// remembered doing -- and what it remembered was bounded by what was still in
// front of it. The window keeps the newest result of each tool first, so a
// build that pressed five controls had all five results under one tool id and
// only the last was certain to be visible when it wrote the result. It did not
// forget its earlier presses; it could no longer see them, and a live build
// produced a result with every one of them missing.
//
// So a step is appended the moment it happens, and the loop carries the list to
// the end. What is appended is what the loop observed -- which action, the
// argument it was given, whether it changed anything -- rather than what the
// model later says it did.
//
// **A step is opaque.** `actionId` is a name Core does not interpret and
// `input` is the argument it was given, carried so a kept step can be written
// down or run again. Nothing here knows what kind of thing is being automated,
// which is the property that lets one draft serve every domain.
//
// The shape is deliberately the one `runtime/exploration-reduction/` already
// reads -- an action, its argument, whether it looked or changed something,
// whether it worked, and a state digest either side -- so a draft reduces
// through the reducer that is already there rather than a second one written
// beside it.

import type { JsonObject } from "../../../../core/index.ts";

/**
 * Whether a step only read the state or changed it.
 *
 * The same two words the evidence loop's tool table and the exploration
 * reducer use, deliberately: a second vocabulary for the same distinction is
 * how the two come to disagree about one action.
 */
export type AutomationStudioFlowDraftStepEffect = "observe" | "mutate";

/**
 * What the model has since said about a step it took.
 *
 * `kept` is where every step starts. The other two are the model's own
 * amendments: `dropped` is "this should not be in the result at all", and
 * `exploratory` is "I did this to look around" -- the deliberate escape hatch
 * from the rule that a changing action always becomes part of the result. They
 * are held apart because they are two different statements about one step, and
 * a reader of the draft can tell a step that was a mistake from one that was a
 * detour.
 */
export type AutomationStudioFlowDraftStepDisposition = "kept" | "dropped" | "exploratory";

export type AutomationStudioFlowDraftStep = {
  /** Where it is in the draft, counting from 1: what an amendment names. */
  position: number;
  /** The loop iteration that decided it. */
  iteration: number;
  /** The call that ran it; absent when the loop answered the request itself. */
  callId?: string;
  /** What was done. An opaque name; Core never interprets it. */
  actionId: string;
  /** The argument it was given, carried so a kept step can be run again. */
  input: JsonObject;
  effect: AutomationStudioFlowDraftStepEffect;
  /** Whether a changing action changed anything, as the caller reported it. */
  effectApplied?: boolean;
  /** The caller's own code for the result. Core carries it and never reads it. */
  resultCode?: string;
  /** A digest of the whole state before the step, when one was taken. */
  stateBefore?: string;
  /** The same digest taken after it. */
  stateAfter?: string;
  disposition: AutomationStudioFlowDraftStepDisposition;
  /** Settings the model amended onto the step. Carried opaquely. */
  settings?: JsonObject;
};

/**
 * Whether a step is one the draft proposes.
 *
 * Three conditions, and each rules out a different thing. It has to have
 * changed something, because an observation is how the loop looked and never
 * what it did. It has to have been reported as applied, because an action that
 * was refused or failed changed nothing to propose. And the model has to have
 * left it alone, because `dropped` and `exploratory` are exactly the two ways
 * it says otherwise.
 */
export function automationStudioFlowDraftStepIsProposed(step: AutomationStudioFlowDraftStep): boolean {
  return step.effect === "mutate" && step.effectApplied !== false && step.disposition === "kept";
}
