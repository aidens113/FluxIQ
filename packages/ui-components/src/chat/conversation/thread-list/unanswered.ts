import type { ChatThreadSummary } from "./summary.ts";

/** How many threads are holding a question nobody has answered. */
export function unansweredThreadCount(threads: readonly ChatThreadSummary[]): number {
  return threads.reduce((total, thread) => total + (thread.pendingAskCount > 0 ? 1 : 0), 0);
}
