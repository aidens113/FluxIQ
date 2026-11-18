import type { PlatformProvisioningService } from "fluxiq/platform";

/** How often due deletions are finished: a latency choice for a 7-day schedule, and for one an immediate deletion left due at once. */
const SWEEP_INTERVAL_MS = 5 * 60_000;

/** The running sweep; `stop` ends the timer and waits for a pass in flight. */
export type DeletionSweep = { runNow(): Promise<void>; stop(): Promise<void> };

/**
 * Finishes scheduled account deletions: every five minutes, on a timer that
 * never keeps the process alive, it runs `runDueDeletions`. A deletion that
 * must wait stays scheduled for the next pass. Failures are logged by class
 * and count only (never a message, which could name an account), and the
 * failed accounts stay scheduled. Passes never overlap.
 */
export function startDeletionSweep(provisioning: Pick<PlatformProvisioningService, "runDueDeletions">, options: { intervalMs?: number; log?: (line: string) => void } = {}): DeletionSweep {
  const log = options.log ?? ((line: string) => console.error(line));
  let running: Promise<void> | null = null;
  let stopped = false;
  const pass = async () => {
    try {
      await provisioning.runDueDeletions();
    } catch (error) {
      log(`[platform] due account deletions failed: ${describeFailures(error)}; they stay scheduled.`);
    }
  };
  const runNow = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    running ??= pass().finally(() => { running = null; });
    return running;
  };
  const timer = setInterval(() => void runNow(), options.intervalMs ?? SWEEP_INTERVAL_MS);
  timer.unref?.();
  return {
    runNow,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await running;
    }
  };
}

/** `Error x2, TypeError x1`: each failure's class and how many. */
function describeFailures(error: unknown): string {
  const failures = error instanceof AggregateError ? error.errors : [error];
  const counts = new Map<string, number>();
  for (const failure of failures) {
    const name = failure instanceof Error ? failure.name : typeof failure;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => `${name} x${count}`).join(", ");
}
