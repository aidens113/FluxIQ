// What a rate limit an attempt met does to its node's pace (P6, CC8, t799).
//
// A failure that asked for a wait raised the pace through `learn` already
// (`./pace-keeper.ts`). A site that refuses an act as too fast and states no
// wait, or that shows a slow-down notice the client then closed so the step went
// through, raised nothing, and the next pass met the same refusal. Both now
// raise it: with a stated wait (the fault's `hintedWaitMs`, or the obstruction's
// `retryAfterMs`) as a hint, without one by `learnUnhinted`.
//
// A rate limit is seen on an attempt as its `obstruction` of kind `rate_limit`
// or as a cleared layer of that kind. An attempt that shows neither, and was
// given no hint, is returned as it was.

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioPaceKeeper } from "./pace-keeper.ts";

/** Whether the attempt met a rate limit: its obstruction says so, or a layer it cleared was one (header). */
function metRateLimit(attempt: AutomationStudioNodeAttemptTrace): boolean {
  return attempt.obstruction?.kind === "rate_limit" || attempt.clearedLayers?.some((layer) => layer.kind === "rate_limit") === true;
}

/**
 * The attempt with `pace.raisedToMs` set when the rate limit it met (or the wait
 * its fault asked for, `hintedWaitMs`) raised its node's pace; otherwise the
 * attempt itself. A hint counts from when the refused attempt settled.
 */
export function automationStudioPaceAfterRateLimit(
  pace: Pick<AutomationStudioPaceKeeper, "learn" | "learnUnhinted">,
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  hintedWaitMs?: number
): AutomationStudioNodeAttemptTrace {
  const refusedAt = attempt.finishedAt ?? attempt.startedAt;
  const limited = metRateLimit(attempt);
  const stated = hintedWaitMs ?? (attempt.obstruction?.kind === "rate_limit" ? attempt.obstruction.retryAfterMs : undefined);
  const raisedToMs = stated !== undefined ? pace.learn(node, stated, refusedAt) : limited ? pace.learnUnhinted(node, refusedAt) : undefined;
  return raisedToMs === undefined ? attempt : { ...attempt, pace: { ...(attempt.pace ?? { inForceMs: 0, waitedMs: 0 }), raisedToMs } };
}
