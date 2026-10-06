// Whether each repeat can still run once a decision's moves are done.
//
// A repeat names its steps by id (`../routing.ts`), so a reorder never changes
// which steps it names -- but it can leave the listing after the step that
// repeats over it, or the span's end before its start. Live run
// `run-musr9pv3-f4bf6256` sent `15 reorder to 14, 15 repeat over 14` (0056)
// when a reorder still renumbered the draft at once: the repeat landed on its
// listing, over the Confirm, and a later reorder left it standing where it
// could never run, to the end of the round, with no word to the model. Two
// rules close it, both read after the decision's last amendment:
//
// - a repeat the decision wrote that cannot run where its steps now stand is
//   taken back and refused, as it would have been had the move come first --
//   so a reorder and a repeat may come in either order in one decision;
// - after a decision that moved a step, every other repeat that can no longer
//   run is taken off and reported `repeat_taken_off`: which step's repeat, over
//   which step, why, in the numbers the model was shown and, where they
//   changed, the ones it reads next.
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftRepeatOrderProblem, automationStudioFlowDraftStepById, type AutomationStudioFlowDraftStepRouting } from "../routing.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "./shown-numbering.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftAmendmentRefusal } from "./types.ts";

type Repeat = Extract<AutomationStudioFlowDraftStepRouting, { kind: "repeat" }>;

/** A repeat a decision wrote, with what the step said before it, checked once the decision's moves are done. */
export type AutomationStudioFlowDraftWrittenRepeat = {
  step: AutomationStudioFlowDraftStep;
  routing: Repeat;
  amendment: AutomationStudioFlowDraftAmendment;
  previous: AutomationStudioFlowDraftStepRouting | undefined;
  settings: JsonObject | undefined;
};

/**
 * The refusal of a repeat an amendment wrote that cannot run where its steps
 * stand, or nothing when it can. `repeat` goes on the act and `over` names the
 * listing before it. A model that put it on the listing -- `repeat` on step 15
 * `over` 15, live run `run-munuj2os-c205ee3a` -- is told that, not that a
 * position is missing. The step it named as over rides along, so the telling
 * can name the listing and the press a loop over it needs by number (live run
 * 37). A listing after the act (`9 repeat over 18`, live run
 * `run-murz83zy-5030820f`) has to be moved before it, and the through rides
 * along so the telling can name it. A span whose through is before its start
 * names no span, and is refused as a position there is not. Every number is
 * the one the draft shown gave the step.
 */
export function automationStudioFlowDraftRepeatRefusal(
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  routing: Repeat,
  amendment: AutomationStudioFlowDraftAmendment,
  shown: AutomationStudioFlowDraftShownNumbering
): AutomationStudioFlowDraftAmendmentRefusal | undefined {
  const problem = automationStudioFlowDraftRepeatOrderProblem(steps, step, routing);
  if (!problem) return undefined;
  if (problem === "span_broken") return { step: amendment.step, reason: "no_such_position" };
  const over = automationStudioFlowDraftStepById(steps, routing.over)!;
  const through = automationStudioFlowDraftStepById(steps, routing.through)!;
  const after = steps.indexOf(over) > steps.indexOf(step) && amendment.through !== undefined && through !== step;
  return { step: amendment.step, reason: "over_not_before", over: shown.number(over), ...(after ? { through: shown.number(through) } : {}) };
}

/**
 * Take back each repeat the decision wrote that its moves left unable to run,
 * putting the step's routing and settings back as they were, and refuse it.
 * A repeat a later amendment of the decision changed again is that amendment's.
 * Answers the refusals and how many applied amendments they take back.
 */
export function automationStudioFlowDraftSettleWrittenRepeats(
  steps: readonly AutomationStudioFlowDraftStep[],
  written: readonly AutomationStudioFlowDraftWrittenRepeat[],
  shown: AutomationStudioFlowDraftShownNumbering
): { refused: AutomationStudioFlowDraftAmendmentRefusal[]; takenBack: number } {
  const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  for (const repeat of written) {
    if (repeat.step.routing !== repeat.routing) continue;
    const refusal = automationStudioFlowDraftRepeatRefusal(steps, repeat.step, repeat.routing, repeat.amendment, shown);
    if (!refusal) continue;
    if (repeat.previous === undefined) delete repeat.step.routing;
    else repeat.step.routing = repeat.previous;
    if (repeat.settings === undefined) delete repeat.step.settings;
    else repeat.step.settings = repeat.settings;
    refused.push(refusal);
  }
  return { refused, takenBack: refused.length };
}

/**
 * Take off every repeat a decision's moves left unable to run, and say each:
 * which step's repeat over which step, why, in the numbers the draft was shown
 * with and, where they changed, the ones it has now. The step and every step
 * after it now run in another context, so their test marks go, as an
 * `unrepeat`'s do (`./apply.ts`).
 */
export function automationStudioFlowDraftTakeOffBrokenRepeats(
  steps: readonly AutomationStudioFlowDraftStep[],
  shown: AutomationStudioFlowDraftShownNumbering
): AutomationStudioFlowDraftAmendmentRefusal[] {
  const taken: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  for (const step of steps) {
    const routing = step.routing;
    if (routing?.kind !== "repeat") continue;
    const problem = automationStudioFlowDraftRepeatOrderProblem(steps, step, routing);
    if (!problem) continue;
    delete step.routing;
    for (const changed of steps.slice(steps.indexOf(step))) delete changed.replayed;
    const over = automationStudioFlowDraftStepById(steps, routing.over)!;
    const through = automationStudioFlowDraftStepById(steps, routing.through)!;
    const span = problem === "span_broken";
    taken.push({
      step: shown.number(step), reason: "repeat_taken_off", over: shown.number(over), takenOff: problem,
      ...(span ? { through: shown.number(through) } : {}),
      ...(step.position !== shown.number(step) ? { now: step.position } : {}),
      ...(over.position !== shown.number(over) ? { overNow: over.position } : {}),
      ...(span && through.position !== shown.number(through) ? { throughNow: through.position } : {})
    });
  }
  return taken;
}
