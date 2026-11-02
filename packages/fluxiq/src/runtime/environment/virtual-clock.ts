type VirtualTimer = {
  readonly deadline: number;
  readonly order: number;
  readonly fire: () => void;
};

/**
 * A clock that moves only when the run waits on it, or when its owner moves
 * it. `delay` advances `now` by the wait and resolves on the next microtask,
 * never on a timer, so an offline trial's backoffs, paces and Wait nodes cost
 * no wall time and every timestamp it writes is reproducible from its
 * starting instant.
 *
 * Its timers are deadlines on this clock (traces and offline trials, P4,
 * "Virtual clock"): `startTimer` has the gateway's timer-source shape
 * (`ClientGatewayTimerSource`), and a timer fires when time passes its
 * deadline -- through `advance` or a `delay` -- never on idleness, so a
 * recorded late answer meets the production timeout logic at its logical
 * time with no wall-clock wait. Time never moves by itself.
 */
export class AutomationStudioVirtualClock {
  private current: number;
  private readonly timers = new Set<VirtualTimer>();
  private started = 0;

  constructor(startAt = 0) {
    this.current = startAt;
  }

  now(): number {
    return this.current;
  }

  /**
   * Starts a wait that fires once time reaches `delayMs` from now, unless it
   * is cancelled first. `wait` names what is waited for; the clock does not
   * read it. A zero, negative or non-finite wait is due at once and fires the
   * next time the clock is moved (an `advance(0)` included). An arrow
   * property, so it can be handed on as a timer source unbound.
   */
  readonly startTimer = (_wait: { readonly kind: string }, delayMs: number, fire: () => void): { cancel(): void } => {
    const wait = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
    this.started += 1;
    const timer: VirtualTimer = { deadline: this.current + wait, order: this.started, fire };
    this.timers.add(timer);
    return { cancel: () => void this.timers.delete(timer) };
  };

  /**
   * Moves time forward by `ms` and fires, in time order (ties in the order
   * they were started), every timer whose deadline it reaches, with `now` at
   * that deadline while it fires. A timer started while firing fires too when
   * its deadline falls within `ms`. A zero, negative or non-finite `ms` moves
   * nothing and fires only what is already due.
   */
  advance(ms: number): void {
    const by = Number.isFinite(ms) && ms > 0 ? ms : 0;
    const target = this.current + by;
    for (let next = this.nextDue(target); next; next = this.nextDue(target)) {
      this.timers.delete(next);
      this.current = Math.max(this.current, next.deadline);
      next.fire();
    }
    this.current = Math.max(this.current, target);
  }

  /** Advances by `ms`, firing every timer it passes, and resolves; a cancelled wait, like the live one, ends at once, here without advancing. */
  async delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    this.advance(ms);
    await Promise.resolve();
  }

  /** The earliest timer due by `target`, or nothing. */
  private nextDue(target: number): VirtualTimer | undefined {
    let earliest: VirtualTimer | undefined;
    for (const timer of this.timers) {
      if (timer.deadline > target) continue;
      if (!earliest) earliest = timer;
      else if (timer.deadline < earliest.deadline) earliest = timer;
      else if (timer.deadline === earliest.deadline && timer.order < earliest.order) earliest = timer;
    }
    return earliest;
  }
}
