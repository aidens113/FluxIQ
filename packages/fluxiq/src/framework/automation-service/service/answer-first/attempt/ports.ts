// What a host or a test may change about how an attempt waits, per service. `service.ts` has a
// line limit and its constructor's options are not this lane's, so this hangs off the service
// as the attempt's stores do (`../attempt-store/store-of.ts`). Tests set `sleep`, so a provider's
// silence is waited out without waiting on the clock.

export type AutomationStudioAnswerFirstAttemptPorts = {
  /** Waits for `ms`, or until `signal` aborts, whichever is first. Never rejects. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /**
   * The timer a Flow run's own deadline and its regions' timeouts run on (`../../../../engine/automation/composite/child-bounds.ts`).
   * Absent: the engine's real timers, as before. A test sets it so a deadline passes exactly when it means to.
   */
  startTimer?: ((wait: { readonly kind: "region_timeout" | "run_deadline" }, delayMs: number, fire: () => void) => { cancel(): void }) | undefined;
};

const PORTS = new WeakMap<object, AutomationStudioAnswerFirstAttemptPorts>();

/** The service's attempt ports, made on first ask. */
export function automationStudioAnswerFirstAttemptPorts(owner: object): AutomationStudioAnswerFirstAttemptPorts {
  const known = PORTS.get(owner);
  if (known) return known;
  const made: AutomationStudioAnswerFirstAttemptPorts = { sleep: wallClockSleep };
  PORTS.set(owner, made);
  return made;
}

function wallClockSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}
