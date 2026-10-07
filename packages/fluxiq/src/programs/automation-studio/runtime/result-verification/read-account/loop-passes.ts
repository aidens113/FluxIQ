// Whether a read's step ran as the passes of a loop, found from the run's
// attempts in the order they ran (read-list design 5.2).
//
// A Flow reads a list page by page with a do-while loop: Merge -> Repeat ->
// read -> ... -> the step that moves the list on, whose `success` goes back to
// the Merge and whose other way on leaves the loop. Core's Repeat answers
// `body` once per pass and `done` at its bound (`nodes/control-flow/repeat.ts`),
// so every pass of the read is a new attempt of it that follows a `body`.
//
// **A read attempt is a pass** when the last Repeat attempt before it answered
// `body`, and either that Repeat ran again after it (the loop came back), or no
// step between the two left the loop. The second clause is what tells a pass
// from a read placed after a loop that its last step left: Repeat `body`, the
// moving step `ended`, then the read.
//
// **How the loop ended** is read after the read's last pass: the Repeat
// answering `done` is its bound; a step that succeeded on a way on other than
// the ones a loop goes round by (`LOOP_ROUTES`) ended it; a step that failed,
// or a last pass of the read that failed, is `failed`. Nothing seen, nothing
// said. Nothing here names a medium: Core's Repeat is the one definition read.

import type { AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";

/** Core's Repeat: the bounded pass counter at the head of a do-while loop. */
const REPEAT_DEFINITION = "builtin.control.repeat";

/** The routes a step answers while the loop goes round: none of them leaves it. */
const LOOP_ROUTES: ReadonlySet<string> = new Set(["success", "skipped", "state_routed", "body", "done"]);

type Attempt = AutomationStudioFlowRunActionAttemptRecord;

/** A read step's passes of one loop: the Repeat that counts them, each pass's attempts, and how the loop ended. */
export type AutomationStudioResultReadLoopPasses = {
  repeatNodeId: string;
  /** Each pass's read attempts, in run order, one entry per pass. */
  passes: Attempt[][];
  stop?: "ended" | "bound" | "failed";
};

/**
 * The loop a read's attempts ran as passes of, or nothing when none of them
 * did. `attempts` is the run's, in run order; `isRead` says which are this
 * step's reads.
 */
export function automationStudioResultReadLoopPasses(attempts: readonly Attempt[], isRead: (attempt: Attempt) => boolean): AutomationStudioResultReadLoopPasses | undefined {
  const passes = new Map<number, Attempt[]>();
  let repeatNodeId: string | undefined;
  let lastPassAt = -1;
  for (const [index, attempt] of attempts.entries()) {
    if (!isRead(attempt)) continue;
    const head = lastRepeatBefore(attempts, index);
    if (head === undefined || attempts[head]!.route !== "body") continue;
    const repeat = attempts[head]!.nodeId;
    if (repeatNodeId !== undefined && repeat !== repeatNodeId) continue;
    if (!ranAgainAfter(attempts, index, repeat) && leftBetween(attempts, head, index)) continue;
    repeatNodeId = repeat;
    passes.set(head, [...(passes.get(head) ?? []), attempt]);
    lastPassAt = index;
  }
  if (repeatNodeId === undefined) return undefined;
  const stop = loopEnd(attempts, lastPassAt);
  return { repeatNodeId, passes: [...passes.values()], ...(stop ? { stop } : {}) };
}

function lastRepeatBefore(attempts: readonly Attempt[], index: number): number | undefined {
  for (let at = index - 1; at >= 0; at -= 1) if (attempts[at]!.definitionId === REPEAT_DEFINITION) return at;
  return undefined;
}

function ranAgainAfter(attempts: readonly Attempt[], index: number, repeatNodeId: string): boolean {
  return attempts.slice(index + 1).some((attempt) => attempt.nodeId === repeatNodeId);
}

/** Whether a step between two attempts succeeded on a way on that leaves a loop. */
function leftBetween(attempts: readonly Attempt[], from: number, to: number): boolean {
  return attempts.slice(from + 1, to).some(leaves);
}

function leaves(attempt: Attempt): boolean {
  return attempt.status === "succeeded" && attempt.route !== undefined && !LOOP_ROUTES.has(attempt.route);
}

/** How the loop ended after the read's last pass, at `lastPassAt`. */
function loopEnd(attempts: readonly Attempt[], lastPassAt: number): AutomationStudioResultReadLoopPasses["stop"] {
  if (attempts[lastPassAt]!.status === "failed") return "failed";
  let failed = false;
  for (const attempt of attempts.slice(lastPassAt + 1)) {
    if (attempt.definitionId === REPEAT_DEFINITION && attempt.route === "done") return "bound";
    if (leaves(attempt)) return "ended";
    if (attempt.status === "failed") failed = true;
  }
  return failed ? "failed" : undefined;
}
