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
 * Its timer for a region's timeout and the run's deadline (`startTimer`, P4
 * "Virtual clock") is taken wherever the environment has one, so a region
 * outlasting its timeout in virtual time times out there. The live environment
 * has none, so a live run's timers stay the executor's real ones; a live
 * environment a test stands in may name its own.
 */
export function automationStudioEnvironmentExecutorOptions(options: AutomationStudioGraphExecutionOptions, environment: AutomationStudioRunEnvironment): AutomationStudioGraphExecutionOptions {
  const placed: AutomationStudioGraphExecutionOptions = { ...options, now: environment.now, delay: environment.delay };
  if (environment.startTimer) placed.startTimer = environment.startTimer;
  if (environment.kind === "live") return placed;
  placed.random = environment.random;
  return placed;
}
