/**
 * A clock that moves only when the run waits on it. `delay` advances `now` by
 * the wait and resolves on the next microtask, never on a timer, so an offline
 * trial's backoffs, paces and Wait nodes cost no wall time and every timestamp
 * it writes is reproducible from its starting instant.
 */
export class AutomationStudioVirtualClock {
  private current: number;

  constructor(startAt = 0) {
    this.current = startAt;
  }

  now(): number {
    return this.current;
  }

  /** Advances by `ms` and resolves; a cancelled wait, like the live one, ends at once, here without advancing. */
  async delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    if (Number.isFinite(ms) && ms > 0) this.current += ms;
    await Promise.resolve();
  }
}
