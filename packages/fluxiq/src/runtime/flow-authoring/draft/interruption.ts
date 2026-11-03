// A step the host says answered an interruption, and so one the Flow does not
// always run.
//
// A host that saw a press answer a layer standing in front of the page -- a
// dialog, a consent wall, a covering popup -- that was gone after it says so on
// the call (`./step.ts`, `interruption`). The Flow is written with such a step
// optional (`../flow-bootstrap/authoring/draft-routing.ts`, through
// `automationStudioFlowDraftInterruptionStepIds` in `./sometimes-present.ts`),
// and every judgement of the draft -- the test from the start, its verdict, a
// rerun's put-back, a partial run -- passes over it the same way, through
// `automationStudioFlowDraftConditionalStepIds` in `./routing.ts`.
//
// **Why it has its own file.** Both of those read this one definition, and
// `./sometimes-present.ts` already imports `./routing.ts`; the predicate lives
// here, beside neither, so neither copies it and no import cycle forms.
//
// **The failure that put it in the judgement too.** Live run
// `run-murwdp4f-35f976d2`: draft step 11 pressed a chat card's "x" the host
// marked as an interruption. The Flow writer made it optional, but the test
// judged it mandatory: its replay failed (the site remembered the dismissal),
// and the test refused the Flow twice on that step alone, while every later
// step replayed; the rerun put-back stopped at the same step, so a rerun ran
// nothing.

import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsProposed } from "./step.ts";

/**
 * Whether the host says this proposed step answered an interruption that may
 * be skipped when it is not there: `interruption` set, no act claimed -- a step
 * that does one of the person's acts is never skipped -- and no routing of its
 * own, which already says when it runs.
 */
export function automationStudioFlowDraftStepAnsweredInterruption(step: AutomationStudioFlowDraftStep): boolean {
  if (step.interruption !== true || step.acts?.length || step.routing !== undefined) return false;
  return automationStudioFlowDraftStepIsProposed(step);
}
