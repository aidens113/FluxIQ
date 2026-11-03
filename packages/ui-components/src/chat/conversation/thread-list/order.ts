// The thread list's order is what someone opening the chat lands on, so the
// question that is holding work up is the one in front of them.

import type { ChatThreadSummary } from "./summary.ts";

/** A thread waiting on an answer first, then open threads, then the most recently updated. */
export function sortThreadsForList(threads: readonly ChatThreadSummary[]): ChatThreadSummary[] {
  return [...threads].sort((left, right) => {
    const waiting = Number(right.pendingAskCount > 0) - Number(left.pendingAskCount > 0);
    if (waiting) return waiting;
    if (left.status !== right.status) return left.status === "open" ? -1 : 1;
    return right.updatedAt - left.updatedAt;
  });
}
