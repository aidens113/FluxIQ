// The internal re-run of a stale step's source (t786, design D3 step 2).
//
// The source -- a read list, a look-up -- is executed once more through the one
// seam every attempt goes through, against the run's values as they stand, so
// its own inputs are what they were. It is internal: its attempt is not pushed
// to the run's attempts, not announced, not numbered, not counted in loop words,
// run datasets or result verification, and it writes nothing into the run's
// values, variables or loop places. One dispatch, no retries of its own.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { executeAutomationStudioNode } from "../node-execution.ts";
import { automationStudioRecordTraceSummary } from "../record-summary.ts";
import type { AutomationStudioRunState } from "../run-state.ts";
import type { AutomationStudioStepLoopContext } from "../step-loop/index.ts";

/**
 * The source's fresh outputs, or nothing when its re-run did not succeed. The
 * rows it reads are kept out of the run's dataset (no record hook) and out of
 * the run's captured records (a run state of its own); the page it ended on is
 * the page the next attempt starts from, as after any dispatch.
 */
export async function automationStudioReacquireSourceRerun(ctx: AutomationStudioStepLoopContext, source: AutomationStudioFlowNode): Promise<Readonly<Record<string, JsonValue>> | undefined> {
  const { onRecordBatch: _notSaved, ...options } = ctx.options;
  const runState: AutomationStudioRunState = {
    ...ctx.runState,
    records: automationStudioRecordTraceSummary(),
    variables: new Map(ctx.runState.variables),
    loops: new Map(ctx.runState.loops)
  };
  // Numbered as the attempt about to run, under the source's id: no attempt of the run takes that id.
  const attempt = await executeAutomationStudioNode(ctx.flow, source, { ...ctx.values }, options, ctx.nextAttemptNumber(), ctx.withholding, runState);
  ctx.runState.pageEnded = runState.pageEnded;
  return attempt.status === "succeeded" ? attempt.outputs : undefined;
}
