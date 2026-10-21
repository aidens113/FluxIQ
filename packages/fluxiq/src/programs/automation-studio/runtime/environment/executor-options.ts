import type { AutomationStudioGraphExecutionOptions } from "../executor/index.ts";
import type { AutomationStudioRunEnvironment } from "./environment.ts";

/**
 * A run's executor options with its clock, waits and randomness taken from
 * `environment` (traces and offline trials, P1, U7). The executor already reads
 * all three from its options and falls back to the wall clock, its own timer
 * and its own randomness when they are absent.
 *
 * The live environment's clock and wait are exactly those fallbacks, so they
 * are set. Its `random` is not: the executor has no single fallback for it --
 * the Wait node reads a missing `random` as no jitter at all (0.5,
 * `../../nodes/timing/wait.ts`) where `Math.random` would add real jitter -- so
 * setting it would change every live run's pauses. A live run's options keep
 * whatever `random` they already had; an offline environment's own `random`
 * is always taken, so its runs are reproducible.
 *
 * Its region timeout timer (`startTimer`, P4 "Virtual clock") likewise: an
 * offline environment's own is taken, so a region outlasting its timeout in
 * virtual time times out there; a live run's is left as it was, so its region
 * timeout stays the executor's real timer.
 */
export function automationStudioEnvironmentExecutorOptions(options: AutomationStudioGraphExecutionOptions, environment: AutomationStudioRunEnvironment): AutomationStudioGraphExecutionOptions {
  const placed: AutomationStudioGraphExecutionOptions = { ...options, now: environment.now, delay: environment.delay };
  if (environment.kind === "live") return placed;
  placed.random = environment.random;
  if (environment.startTimer) placed.startTimer = environment.startTimer;
  return placed;
}
