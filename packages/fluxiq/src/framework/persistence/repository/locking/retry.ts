import { setTimeout as delay } from "node:timers/promises";

/**
 * Native busy waits occupy libuv's worker threads. Several contenders can then
 * starve the lock holder's next statement. Retry on the event loop so the holder
 * can commit, retaining the repository infrastructure's ten-second lock deadline.
 */
export async function withSQLiteLockRetry<T>(operation: () => Promise<T>): Promise<T> {
  const deadline = performance.now() + 10_000;
  for (;;) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "SQLITE_BUSY" || performance.now() >= deadline) throw error;
      await delay(5);
    }
  }
}
