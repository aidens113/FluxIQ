// What a forward run adds to a replay (t861, plan D2): run what the model wrote
// on the rows not yet done, from the page as it stands, and never from the top.
//
// The ordinary replay checks a lasting step and never repeats it, because it is
// a test and a test must not act twice. A forward run is not a test: the model
// did the first row by hand, wrote the loop, and now the loop does the rest, so
// a lasting step on a row not yet done really acts. Two questions decide it,
// and both are the caller's to answer from its act record, never the replay's:
//
//   rowDone   this row already took its lasting act: its whole pass is left
//             out, nothing is sent for it, and the answer counts it as skipped.
//   stepDone  a lasting step with no row already landed: it is checked
//             (`verify`), never sent as a step.
//
// **A failing step on a row ends that row's pass, and no other (t869).** Paid run `run-mw37vz9n-a77a02c2` got one row by
// hand and none by its loop. A step that does not pass on a row closes that pass: nothing later in it that declares a
// lasting act is sent, its later steps that declare nothing still are, since that is how a pass that opened a row comes
// back for the next one, the row is named to the model (`rowsNotDone`), and the run goes on with the next row. A row whose
// lasting step landed and whose way back alone failed is done, and only needs the list reached again. No failing pass
// ends the run. The host says which rows it could not find a control for at all
// (`AUTOMATION_STUDIO_NODE_REPLAY_ROW_CONTROL_NOT_FOUND_REASON`), since only of those can the model be told nothing was
// done; the rest are also named apart (`rowsStepFailed`). A pass whose step went as a page-level link, so that nothing
// says it still stands on its row (`AUTOMATION_STUDIO_NODE_REPLAY_ROW_LEFT_BEHIND_REASON`), is told the same way at its
// next lasting step, which is not sent, unless a step between them found its row again.
//
// **A row the record holds done.** Known at the pass's start, its whole pass is left out and sends nothing. Known only
// when a step of the pass is refused for it (`answeredDone`), the pass is closed there as a pass that failed is, and the
// row is counted as skipped: it is not a failure, and it is never named as not done.
//
// **How the next pass reaches the list.** By the loop's own way back when the last pass ran it and it worked. Otherwise a
// pass's first step goes out with `AUTOMATION_STUDIO_NODE_REPLAY_REACH_KEY`, and the host moves to the address that step
// was found on if the page is not there. That is a move: no reset, nothing lasting and nothing put back. A span of one
// step never asks: it did not set out to leave its list, and the list the model is on may be another page of it than the
// step was found on. The list a repeat walks is read with the same key when it was before the range, or once more when
// it was in the range and answered that this is not its page (`./forward-range.ts`).
//
// **A repeat with no rows to walk is not run.** A list step that did not answer rows, whatever the reason, says nothing
// of which row a step is on, and a lasting step sent with no row acts on whatever page stands there. So none of the
// repeat is sent, the run stops at its first step, and the answer says so. A repeat over a check whose first ask does not
// hold runs zero times, as the Flow does, and the run goes on.
//
// No reset and no re-anchor is ever sent with these, and every call still goes
// through the loop's executor, so the permission gate sees each one.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";
import type { automationStudioLlmEvidenceParseToolExecutionResult } from "../../evidence-loop-decision.ts";

/** The key on a step's call that asks the host to get to the page its `from` names first (see the header). A host that does not know it runs the step where the page stands, which answers for itself. */
export const AUTOMATION_STUDIO_NODE_REPLAY_REACH_KEY = "reach";

/** An answered call as the replay reads it: the loop executor's result after `automationStudioLlmEvidenceParseToolExecutionResult`, which is what the replay holds of it. */
export type AutomationStudioFlowDraftReplayAnsweredCall = NonNullable<ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>>;

/** What the forward run asks of its caller, and tells it. */
export type AutomationStudioFlowDraftReplayForward = {
  /** This row already took its lasting act: the pass is excluded, nothing is sent for it. */
  rowDone(row: JsonObject): boolean;
  /** This step's own lasting act already landed: it is checked, never sent again. */
  stepDone(step: AutomationStudioFlowDraftStep): boolean;
  /** This call's answer says the record refused it as already done, or as maybe done: it did nothing, and that is not its failing. Absent, no answer says so. */
  answeredDone?(resultCode: string | undefined): boolean;
  /** What each pass really did, for the record: called once per answered call, with its row when it is a pass of a list. */
  passed?(step: AutomationStudioFlowDraftStep, row: JsonObject | undefined, answer: AutomationStudioFlowDraftReplayAnsweredCall): void;
};

/** How many rows a forward run did, left out as already done, and failed on. Counts only, never a row's values. */
export type AutomationStudioFlowDraftReplayRowCounts = { done: number; skipped: number; failed: number };
