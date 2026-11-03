// The conversation commands still running after their request answered.
//
// A build started from the chat outlives the request that started it, so
// nothing awaits it. It is tracked here instead: a test waits for the work it
// started to settle before reading the thread, and a failure nothing else
// could report -- the thread itself could not be written -- is kept, not lost.

const running = new Set<Promise<unknown>>();
const unreported: unknown[] = [];

export const automationStudioConversationCommandWork = Object.freeze({
  /** Keeps `work` until it settles. A rejection is kept in `unreported`, never thrown into the void. */
  track(work: Promise<unknown>): void {
    const settled = work.then(
      () => { running.delete(settled); },
      (error: unknown) => {
        unreported.push(error);
        running.delete(settled);
      }
    );
    running.add(settled);
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
