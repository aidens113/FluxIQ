// What a host or a test may change about how an attempt waits, per service. `service.ts` has a
// line limit and its constructor's options are not this lane's, so this hangs off the service
// as the attempt's stores do (`../attempt-store/store-of.ts`). Tests set `sleep`, so a provider's
// silence is waited out without waiting on the clock.

export type AutomationStudioAnswerFirstAttemptPorts = {
  /** Waits for `ms`, or until `signal` aborts, whichever is first. Never rejects. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** How long this Flow has spent waiting for a person outside the attempt's own waits, such as a locked key: no limit counts it. Absent, nothing. */
  personHeldMs?: ((scope: { projectId: string; flowId: string }) => number) | undefined;
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
