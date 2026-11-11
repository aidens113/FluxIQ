// The conversation commands still running after their request answered.
//
// A build started from the chat outlives the request that started it, so
// nothing awaits it. It is tracked here instead: a test waits for the work it
// started to settle before reading the thread, and a failure nothing else
// could report -- the thread itself could not be written -- is kept, not lost.
//
// Each piece of work is also counted against the thread it was started from,
// for as long as it runs: it writes its ending into that thread, so the thread
// must not be removed under it (`../conversations.ts`, `deleteConversation`).

const running = new Set<Promise<unknown>>();
const unreported: unknown[] = [];
const byThread = new Map<string, number>();

/** The key of one project's thread. JSON, so no id can run into the next. */
function threadKey(thread: { projectId: string; conversationId: string }): string {
  return JSON.stringify([thread.projectId, thread.conversationId]);
}

function count(key: string, delta: 1 | -1): void {
  const next = (byThread.get(key) ?? 0) + delta;
  if (next > 0) byThread.set(key, next);
  else byThread.delete(key);
}

export const automationStudioConversationCommandWork = Object.freeze({
  /**
   * Keeps `work` until it settles, counted against `thread` when it was started
   * from one. A rejection is kept in `unreported`, never thrown into the void.
   */
  track(work: Promise<unknown>, thread?: { projectId: string; conversationId: string }): void {
    const key = thread === undefined ? undefined : threadKey(thread);
    if (key !== undefined) count(key, 1);
    const settled = work.then(
      () => {
        running.delete(settled);
        if (key !== undefined) count(key, -1);
      },
      (error: unknown) => {
        unreported.push(error);
        running.delete(settled);
        if (key !== undefined) count(key, -1);
      }
    );
    running.add(settled);
  },
  /** Whether work started from this thread is still running in this process. */
  busy(thread: { projectId: string; conversationId: string }): boolean {
    return byThread.has(threadKey(thread));
  },
  /** Resolves once nothing is running, including work started while waiting. */
  async idle(): Promise<void> {
    while (running.size) await Promise.all([...running]);
  },
  /** How many commands are still running. */
  pending(): number {
    return running.size;
  },
  /** Failures that could not be written into their thread, oldest first; reading them clears them. */
  takeUnreported(): unknown[] {
    return unreported.splice(0, unreported.length);
  }
});
