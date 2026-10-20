// How often the relay may send what changed: at most once per interval. The
// first request after a quiet interval runs at once; any made before the
// interval ends are folded into one run at its end, which reads the state as
// it is then. So a burst of events costs one send per interval, and the last
// change of a burst is always sent.

import type { ActivityClock, ActivityTimer } from "./clock.ts";

/** Four sends a second. */
export const ACTIVITY_FAN_OUT_INTERVAL_MS = 250;

export class FanOutGate {
  private lastRunAt = Number.NEGATIVE_INFINITY;
  private timer: ActivityTimer | undefined;

  constructor(
    private readonly clock: ActivityClock,
    private readonly run: () => void,
    private readonly intervalMs: number = ACTIVITY_FAN_OUT_INTERVAL_MS
  ) {}

  /** Asks for a run: now, or at the end of the current interval. */
  request(): void {
    if (this.timer !== undefined) return;
    const wait = this.lastRunAt + this.intervalMs - this.clock.now();
    if (wait <= 0) {
      this.fire();
      return;
    }
    this.timer = this.clock.setTimeout(() => this.fire(), wait);
  }

  private fire(): void {
    this.timer = undefined;
    this.lastRunAt = this.clock.now();
    this.run();
  }
}
