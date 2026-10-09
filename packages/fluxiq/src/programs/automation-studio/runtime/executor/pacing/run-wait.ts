import type { AutomationStudioGraphExecutionOptions } from "../contracts.ts";

/**
 * Every wait a graph run takes on its own account: between two attempts of a
 * node, for a pace between two starts of one, and for a Wait node's pause.
 *
 * A caller may supply its own `delay`, so a test or a simulator spends no wall
 * clock. The default timer is unreferenced -- a wait must never be the reason a
 * process stays alive -- and ends the moment the run is cancelled, so a
 * cancelled run is not held for the rest of a long pause. Whoever waited checks
 * the signal afterwards; the wait itself never throws.
 */
export async function automationStudioRunWait(options: Pick<AutomationStudioGraphExecutionOptions, "delay" | "signal">, waitMs: number): Promise<void> {
  if (!(waitMs > 0)) return;
  if (options.delay) {
    await options.delay(waitMs, options.signal);
    return;
  }
  const signal = options.signal;
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer: ReturnType<typeof setTimeout> = setTimeout(done, waitMs);
    (timer as { unref?: () => void }).unref?.();
    signal?.addEventListener("abort", done, { once: true });
  });
}
