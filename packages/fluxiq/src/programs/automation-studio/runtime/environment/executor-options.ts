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
 */
export function automationStudioEnvironmentExecutorOptions(options: AutomationStudioGraphExecutionOptions, environment: AutomationStudioRunEnvironment): AutomationStudioGraphExecutionOptions {
  const placed: AutomationStudioGraphExecutionOptions = { ...options, now: environment.now, delay: environment.delay };
  if (environment.kind !== "live") placed.random = environment.random;
  return placed;
}
