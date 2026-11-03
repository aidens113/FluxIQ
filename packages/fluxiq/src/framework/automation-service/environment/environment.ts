import type { AutomationStudioGraphExecutionOptions } from "../executor/index.ts";

/** Where a run's world comes from: the live client, a recorded trace (P4), or a scripted fixture (unit tests). Carried into the result contract as the evidence origin. */
export type AutomationStudioRunEnvironmentKind = "live" | "trace" | "fixture";

/**
 * Everything nondeterministic a run or trial reads, in one port (traces and
 * offline trials, P1; lane T U2b, section 4): its clock, its randomness, its
 * run ids, and the client channel its commands go out on. Live or offline is
 * a choice of environment, never a second code path: the executor, the trial
 * runner and the evidence tools keep going through the same gateway, and
 * `within` decides which of the gateway's sessions they can see and reach.
 *
 * The clock fields have the executor's own option shapes
 * (`AutomationStudioGraphExecutionOptions.now`, `delay`, `random`), so a run's
 * options take them unchanged; `newRunId` mints what the trial ports'
 * `newRunId` returns, under a caller-chosen prefix.
 */
export type AutomationStudioRunEnvironment = {
  readonly kind: AutomationStudioRunEnvironmentKind;
  now: NonNullable<AutomationStudioGraphExecutionOptions["now"]>;
  delay: NonNullable<AutomationStudioGraphExecutionOptions["delay"]>;
  random: NonNullable<AutomationStudioGraphExecutionOptions["random"]>;
  /**
   * The timer source this environment's deadlines run on (traces and offline
   * trials, P4, "Virtual clock"), in the gateway's timer-source shape
   * (`ClientGatewayTimerSource`), so the same source serves the executor's
   * region timeout (`AutomationStudioGraphExecutionOptions.startTimer`) and the
   * gateway's waits for a command sent inside `within`. Absent: real timers,
   * as the live environment leaves it.
   */
  startTimer?: ((wait: { readonly kind: string }, delayMs: number, fire: () => void) => { cancel(): void }) | undefined;
  /** A fresh run id, `<prefix>.<unique>`, as the trial runner's own fallback mints one (`trial.<uuid>`). */
  newRunId(prefix: string): string;
  /**
   * Runs `work` with this environment's client channel in force: every gateway
   * command issued and every gateway session read inside it sees only this
   * environment's sessions. Live: `work` runs unchanged, outside any scope.
   */
  within<T>(work: () => Promise<T>): Promise<T>;
};
