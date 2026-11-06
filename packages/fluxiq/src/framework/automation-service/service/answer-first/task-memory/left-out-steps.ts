// The steps of an attempt that did something lasting and are out of the Flow it saved (t869): the
// model dropped them from its draft, so what they did stands on the site and the saved Flow will not
// do it again. The saved line says so, by the step's own words, or "one step that did something on
// the site" where it has none: never its position or an id, which a person does not read.
// A step whose act another step of the saved Flow still does is not left out (`./step-still-done.ts`):
// a replaced, re-added, merged or stamped step is the same act.
//
// The step carries the control's own words (`words.target`, else `control`), which are the site's, as the act's
// line says it ("Save"). The record holds no link from a step to the act it made, so the act's line is not looked
// up here: the control's words are what the act's own line is made of.

import { automationStudioFlowDraftStepLandedOut, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAttemptActIsAddress } from "../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstStepStillDone } from "./step-still-done.ts";

/** What a step nothing names is called; the card says the same words (`ui-components`, `left-out-words.ts`). */
const UNNAMED_STEP = "one step that did something on the site";

/** A name a person reads: not an address, and not one unbroken run holding a digit (an id, a handle). */
function readable(name: string): boolean {
  return /\p{L}/u.test(name) && !automationStudioAttemptActIsAddress(name) && !(!/\s/u.test(name) && /\d/u.test(name) && /^[\w.:#-]+$/u.test(name));
}

/** The name of each such step, as a person reads it, in the order of the draft. */
export function automationStudioAnswerFirstLeftOutSteps(steps: readonly AutomationStudioFlowDraftStep[]): string[] {
  return steps
    .filter((step) => automationStudioFlowDraftStepLandedOut(step) && !automationStudioAnswerFirstStepStillDone(step, steps))
    .map((step) => {
      const name = (step.words?.target ?? step.control ?? "").replace(/\s+/gu, " ").trim().slice(0, 200);
      return name.length > 0 && readable(name) ? name : UNNAMED_STEP;
    });
}
