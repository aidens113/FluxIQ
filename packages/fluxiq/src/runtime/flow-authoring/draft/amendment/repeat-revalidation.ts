// Whether each repeat a decision wrote can run where its steps stand.
//
// A repeat names its steps by id (`../routing.ts`), and the listing it walks
// has to run before the step that repeats over it, and its span's end after its
// start. Live run `run-musr9pv3-f4bf6256` (0056) left a repeat standing where
// it could never run, to the end of the round, with no word to the model. So a
// repeat the decision wrote that cannot run where its steps stand is taken back
// and refused, once the decision's last amendment is read. The draft's steps
// stand in the order they ran (the framework drafts it, and no edit moves a
// step), so a repeat over a listing read after the act is refused here.
import type { JsonObject } from "../../../../core/index.ts";
import {
  automationStudioFlowDraftRepeatIsWhile,
  automationStudioFlowDraftRepeatOrderProblem,
  automationStudioFlowDraftStepById,
  type AutomationStudioFlowDraftStepRouting
} from "../routing.ts";
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
  // A repeat while its last step succeeds is never over_after: its only problem is a broken span.
  if (problem === "span_broken" || automationStudioFlowDraftRepeatIsWhile(routing)) return { step: amendment.step, reason: "no_such_position" };
  const over = automationStudioFlowDraftStepById(steps, routing.over)!;
  const through = automationStudioFlowDraftStepById(steps, routing.through)!;
  const after = steps.indexOf(over) > steps.indexOf(step) && amendment.through !== undefined && through !== step;
  return { step: amendment.step, reason: "over_not_before", over: shown.number(over), ...(after ? { through: shown.number(through) } : {}) };
}

/**
 * Take back each repeat the decision wrote that cannot run where its steps stand,
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
