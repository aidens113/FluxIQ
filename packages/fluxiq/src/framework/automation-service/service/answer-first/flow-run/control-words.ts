// The words a saved step recorded for its control, screened to be shown in a permission question.
//
// A saved Flow's run asks before it has shown the gate anything, so the gate cannot name a control
// (`./permission.ts`). The words are the step's own record (`words.target`, then `control`), which
// is page text: each passes the screen every answer's words pass (credential-shaped text is dropped
// whole, locator-shaped text is rewritten and so counted as withheld), and a word the screen
// touched at all is left out rather than shown in part, so the question then reads as it does for
// an unnamed control. They are for display and decide nothing.

import type { AutomationStudioFlowBootstrapScreenedControlWords } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioFlowLessScreenedWords } from "../../../../../runtime/result-verification/index.ts";

/** The step's words that may be shown, in the order tried; none when no word passes whole. */
export function automationStudioAnswerFirstFlowRunControlWords(step: Pick<AutomationStudioFlowDraftStep, "words" | "control">): AutomationStudioFlowBootstrapScreenedControlWords[] {
  const shown: AutomationStudioFlowBootstrapScreenedControlWords[] = [];
  for (const candidate of [step.words?.target, step.control]) {
    if (typeof candidate !== "string") continue;
    const screened = automationStudioFlowLessScreenedWords(candidate);
    if (screened.withheld || !screened.text) continue;
    shown.push(screened.text as AutomationStudioFlowBootstrapScreenedControlWords);
  }
  return shown;
}
