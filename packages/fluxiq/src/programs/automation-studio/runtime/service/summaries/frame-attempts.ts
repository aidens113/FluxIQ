// Every frame's attempts, in run order, for the run detail (state-aware
// recovery plan, C1, C11).
//
// A Call Subflow attempt runs a called part as a frame of its own, and the
// part's attempts live in that attempt's `childTrace`, not in the run's trace.
// The run detail used to map the root frame's attempts alone, so nothing a
// part did -- its steps, the entry it began at, the handlers that ran in it --
// reached the run detail, the stored runtime events, a judge or the run log.
//
// **The call attempt stays, as a container row.** It is the root frame's step:
// its route, failure and `subflowTarget` are what the calling frame acted on,
// and every reader that acts on the Flow itself (recovery, re-authoring, start
// pages) reads only the root frame's rows, exactly as before. Its part's
// attempts follow it, depth first, each naming it as `parentAttemptId`; a part
// that calls another part nests the same way. A reader that counts steps counts
// a container's children and not the container (`step-count.ts`).
//
// Only a Call Subflow attempt's child is projected. A Call Flow attempt's
// `childTrace` is a published Flow's own run and is left as it was.

import { createHash } from "node:crypto";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";

/** One attempt of the run, where the run detail places it. */
export type AutomationStudioRunDetailAttemptPlacement = {
  attempt: AutomationStudioNodeAttemptTrace;
  /** The run detail's id for it: the trace's own for a root-frame attempt, else unique within the run. */
  attemptId: string;
  /** The run detail id of the Call Subflow attempt whose part ran it; absent in the root frame. */
  parentAttemptId?: string;
};

/** The longest id the runtime stream store keeps (`storage/project/runtime-stream-store.ts`, `requiredId`). */
const MAX_ID_LENGTH = 200;

/**
 * The run's attempts, root frame first in its own order, each Call Subflow
 * attempt followed at once by its part's attempts. A part's attempt ids are
 * numbered within its own frame, so the same part called twice repeats them:
 * each is prefixed with its container's run detail id, which is unique.
 */
export function automationStudioRunDetailAttemptsInRunOrder(attempts: readonly AutomationStudioNodeAttemptTrace[]): AutomationStudioRunDetailAttemptPlacement[] {
  const placed: AutomationStudioRunDetailAttemptPlacement[] = [];
  const visit = (frame: readonly AutomationStudioNodeAttemptTrace[], parentAttemptId: string | undefined): void => {
    for (const attempt of frame) {
      const attemptId = parentAttemptId === undefined ? attempt.attemptId : childAttemptId(parentAttemptId, attempt.attemptId);
      placed.push({ attempt, attemptId, ...(parentAttemptId !== undefined ? { parentAttemptId } : {}) });
      // Session traces are read back from storage, so the child's shape is checked.
      const child = attempt.subflowTarget ? attempt.childTrace?.attempts : undefined;
      if (Array.isArray(child)) visit(child, attemptId);
    }
  };
  visit(attempts, undefined);
  return placed;
}

function childAttemptId(parentAttemptId: string, attemptId: string): string {
  const joined = `${parentAttemptId}:${attemptId}`;
  if (joined.length <= MAX_ID_LENGTH) return joined;
  const shortened = `${digest(parentAttemptId).slice(0, 16)}:${attemptId}`;
  return shortened.length <= MAX_ID_LENGTH ? shortened : digest(joined);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
