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
// No reset and no re-anchor is ever sent with these, and every call still goes
// through the loop's executor, so the permission gate sees each one.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";
import type { automationStudioLlmEvidenceParseToolExecutionResult } from "../../evidence-loop-decision.ts";

/** An answered call as the replay reads it: the loop executor's result after `automationStudioLlmEvidenceParseToolExecutionResult`, which is what the replay holds of it. */
export type AutomationStudioFlowDraftReplayAnsweredCall = NonNullable<ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>>;

/** What the forward run asks of its caller, and tells it. */
export type AutomationStudioFlowDraftReplayForward = {
  /** This row already took its lasting act: the pass is excluded, nothing is sent for it. */
  rowDone(row: JsonObject): boolean;
  /** This step's own lasting act already landed: it is checked, never sent again. */
  stepDone(step: AutomationStudioFlowDraftStep): boolean;
  /** What each pass really did, for the record: called once per answered call, with its row when it is a pass of a list. */
  passed?(step: AutomationStudioFlowDraftStep, row: JsonObject | undefined, answer: AutomationStudioFlowDraftReplayAnsweredCall): void;
};

/** How many rows a forward run did, left out as already done, and failed on. Counts only, never a row's values. */
export type AutomationStudioFlowDraftReplayRowCounts = { done: number; skipped: number; failed: number };
