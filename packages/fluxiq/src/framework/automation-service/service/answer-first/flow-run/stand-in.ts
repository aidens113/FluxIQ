// The step a saved Flow broke at leaves the Flow once this attempt did its work another way and put
// that in the Flow (the hand fix). Applied once, at the ending, before anything is saved
// (`../attempt/ending.ts`), so the draft, the task's Flow and any proposal made from it hold the fix and not
// the broken step.
//
// **The failure this closes.** A saved Flow's run stopped at a step whose control the site had
// renamed. The model was told to write the changed step, drop the old one and run forward; it pressed
// the renamed control by hand instead, with `add`, and the result was judged achieved. The draft then
// held both presses, the broken one where it always stood and the fix after it, so every later
// attempt ran into the broken step first and stopped there while the site stayed as it was.
//
// **What stands in for it.** The saved step the run stopped at (`failing`), still in the Flow, never
// passed by a forward run since, and not a repeat; and the first step after it in the Flow that this
// attempt made (its id is none of the saved steps'), that runs the same node through the same tool with
// the same effect, stands for nothing else and carries no routing of its own. The same node changed is
// what a rerun of the step is, and a rerun already takes the place of the step it replaces
// (`runtime/llm/evidence-loop/rerun/replacement.ts`): the stand-in is handed to that, so it takes the
// broken step's place, its acts, its places on the route, its routing and the node it stood for, and
// the broken step stays listed at the end as the receipt of what was replaced.
//
// **The way there comes with it.** Any step this attempt made and put in the Flow between the broken
// step and its stand-in was done live, from the page the run left, on the way to the stand-in, so it
// moves with the stand-in, in its order, to where the broken step stood. A saved step between the two
// keeps its place after them, as it stood after the broken step.
//
// **A repeat is not stood in for.** It does its act to every row of a list; one step made by hand does
// it to one row, so it is no replacement and the Flow is left as the model left it.
//
// **Nothing changes unless the drop holds.** The work is done on copies, and kept only where the broken
// step really left the Flow: a drop the draft's own checks put back leaves the steps as they were.

import { automationStudioFlowDraftStepCopy, automationStudioFlowDraftStepId, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioLlmEvidenceRerunReplaced } from "../../../../../runtime/llm/evidence-loop/index.ts";
import type { AutomationStudioAnswerFirstFlowRunOutcome } from "./outcome.ts";

type Step = AutomationStudioFlowDraftStep;

/** What the stand-in reads of an attempt, and the steps it changes. */
export type AutomationStudioAnswerFirstStandInRun = {
  /** The saved Flow's run, where one was tried. */
  flowRun?: { outcome: AutomationStudioAnswerFirstFlowRunOutcome; wentOut: boolean } | undefined;
  /** The saved steps the attempt started from, which the run's positions name. */
  startedWith: readonly Step[];
  /** The draft as the attempt ends: replaced, never edited in place, where a stand-in is found. */
  steps: Step[];
  /** The ids of the steps a forward run passed in this attempt. */
  forwardPassed: ReadonlySet<string>;
};

/** Puts the stand-in in the broken step's place on `run.steps` (header). Says whether it did. */
export function automationStudioAnswerFirstStandIn(run: AutomationStudioAnswerFirstStandInRun): boolean {
  const outcome = run.flowRun?.wentOut ? run.flowRun.outcome : undefined;
  const failing = outcome?.kind === "ran" && !outcome.reachedEnd ? outcome.failing : undefined;
  if (!failing) return false;
  const savedIds = new Set(run.startedWith.map(automationStudioFlowDraftStepId));
  const brokeAt = run.startedWith.find((step) => step.position === failing.position);
  if (!brokeAt) return false;
  const steps = run.steps.map((step) => automationStudioFlowDraftStepCopy(step));
  const broken = steps.find((step) => automationStudioFlowDraftStepId(step) === automationStudioFlowDraftStepId(brokeAt));
  if (!broken || !automationStudioFlowDraftStepIsProposed(broken) || broken.replacedBy !== undefined || broken.routing?.kind === "repeat" || run.forwardPassed.has(automationStudioFlowDraftStepId(broken))) return false;
  const madeHere = (step: Step): boolean => !savedIds.has(automationStudioFlowDraftStepId(step)) && automationStudioFlowDraftStepIsProposed(step);
  const after = steps.slice(steps.indexOf(broken) + 1);
  const standIn = after.find((step) => madeHere(step) && step.standsFor === undefined && step.routing === undefined && step.actionId === broken.actionId && step.toolId === broken.toolId && step.effect === broken.effect);
  if (!standIn) return false;
  // The way there: made here, in the Flow, between the two, in the order the draft holds them.
  const way = after.slice(0, after.indexOf(standIn)).filter(madeHere);
  const ordered = steps.filter((step) => step !== standIn && !way.includes(step));
  ordered.splice(ordered.indexOf(broken), 0, ...way);
  ordered.push(standIn);
  ordered.forEach((step, index) => { step.position = index + 1; });
  automationStudioLlmEvidenceRerunReplaced(ordered, broken, { takesItsPlace: true });
  if (broken.disposition === "kept" || standIn.disposition !== "kept") return false;
  run.steps = ordered;
  return true;
}
