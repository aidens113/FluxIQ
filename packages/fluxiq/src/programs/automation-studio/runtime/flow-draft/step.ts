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
import type { AutomationStudioFlowDraftReplayOutcome, AutomationStudioFlowDraftStepReplay } from "./dry-run.ts";

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
  /**
   * The tool the call went through, when that is not `actionId` itself.
   *
   * One tool may run any number of named things -- the library of nodes a
   * build may run is one tool whose argument names the node -- and then the
   * draft's `actionId` is the node and this is the tool that ran it. An
   * amendment that asks for a step to be run again needs both: the tool to
   * call, and the name to record against what comes back.
   */
  toolId?: string;
  /**
   * The argument it was given, as the caller reported it, and the only one the
   * model is ever shown back.
   */
  input: JsonObject;
  /**
   * What the step actually ran with, when that is not what it was written with.
   *
   * The two differ whenever an argument names something by a token the caller
   * has to make real -- a handle standing for a control the model was shown --
   * and the difference matters twice. What is written down is the *resolved*
   * form, because a token is a name for something on a page as it was, and a
   * page that re-renders stops having it: a live build ran four nodes
   * successfully and had its Flow refused because the handles no longer
   * resolved. What the model is *shown* is the written form, because the
   * resolved form is the caller's own medium -- selectors, in the web's case --
   * and a domain declares keys that may never reach a model.
   *
   * Core reads neither. Both are opaque JSON carried for whoever writes the
   * step down.
   */
  ranWith?: JsonObject;
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
  /**
   * Whether a successful call of this kind is a step the result should
   * contain, as the caller reported it.
   *
   * Absent, it is read from the effect, which is the rule that held while the
   * only things a loop could do were look and change: an observation is how
   * the loop looked and a change is what it did. That rule stops being true the
   * moment the things a loop runs are the *nodes the result is made of*. A
   * list extraction changes nothing on the page and is the whole point of a
   * scraping Flow; a snapshot changes nothing and belongs in no Flow at all.
   * Neither can be told from the other by its effect, so the caller that ran
   * it says which it was, and says `false` for one that failed -- a step that
   * did not work is not a step the result may contain.
   */
  proposes?: boolean;
  /** Settings the model amended onto the step. Carried opaquely. */
  settings?: JsonObject;
  /**
   * What running this step again needs, when the caller can run it again.
   *
   * Opaque, like `input` and `ranWith`: how to put the target back the way this
   * step found it, and what it produced, so the caller can say whether a replay
   * reproduced it. Core carries both and reads neither (`./dry-run.ts`). A
   * draft whose proposed steps all carry it is a draft that must replay clean
   * before it may be proposed; one that does not is simply not replayed.
   */
  replay?: AutomationStudioFlowDraftStepReplay;
  /**
   * How this step answered the last time the draft was replayed.
   *
   * Written by the loop, not by the caller, and kept on the step so the record
   * of what the Flow did when it was run as a Flow travels with the step it is
   * about -- the draft the model is shown reads it, and so does anyone reading
   * the steps afterwards.
   */
  replayed?: AutomationStudioFlowDraftReplayOutcome;
};

/**
 * Whether a step is one the draft proposes.
 *
 * Two conditions. The step has to be one of the kind a result is made of, and
 * to have worked: the caller says so on `proposes`, and where it said nothing
 * the older rule stands -- it changed something, and the change applied. And
 * the model has to have left it alone, because `dropped` and `exploratory` are
 * exactly the two ways it says otherwise.
 */
export function automationStudioFlowDraftStepIsProposed(step: AutomationStudioFlowDraftStep): boolean {
  return step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step);
}

/**
 * Whether a step is one the result could contain, before the model's own
 * amendments are consulted.
 *
 * The draft shown to the model lists these, so a step it withdrew is still on
 * the list with `inResult: false` beside it rather than silently gone. A step
 * that only looked, or that failed, is not on it at all: neither is a thing the
 * model could put in the Flow by changing its mind about it.
 */
export function automationStudioFlowDraftStepIsProposable(step: AutomationStudioFlowDraftStep): boolean {
  return automationStudioFlowDraftStepIsAction(step) && step.effectApplied !== false;
}

/**
 * Whether a step is one of the kind a result is made of, whether or not this
 * attempt worked.
 *
 * This is what the draft *lists*, because the receipt is what makes the draft
 * checkable: a reader can see that the loop pressed six controls, that one of
 * them failed and one was withdrawn, and that the other four are what the
 * result contains. A list with the other two silently absent is a claim nobody
 * can audit. A step that only looked is not of that kind at all and is not
 * listed.
 */
export function automationStudioFlowDraftStepIsAction(step: AutomationStudioFlowDraftStep): boolean {
  return step.proposes ?? step.effect === "mutate";
}
