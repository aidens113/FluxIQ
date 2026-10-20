// A clock the test moves. Timers run in due order, each at its own time, when
// the clock passes them; a timer a timer sets runs in the same advance if it
// falls inside it.

import type { ActivityClock } from "../clock.ts";

type Timer = { id: number; due: number; callback: () => void };

export class FakeClock implements ActivityClock {
  private time: number;
  private timers: Timer[] = [];
  private nextId = 1;

  constructor(start = 0) {
    this.time = start;
  }

  readonly now = (): number => this.time;

  readonly setTimeout = (callback: () => void, delayMs: number): unknown => {
    const timer = { id: this.nextId++, due: this.time + Math.max(0, delayMs), callback };
    this.timers.push(timer);
    return timer.id;
  };

  readonly clearTimeout = (timer: unknown): void => {
    this.timers = this.timers.filter((candidate) => candidate.id !== timer);
  };

  /** Moves the clock to `time`, running every timer due on the way. */
  advanceTo(time: number): void {
    for (;;) {
      const next = [...this.timers].sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!next || next.due > time) break;
      this.timers = this.timers.filter((candidate) => candidate !== next);
      this.time = Math.max(this.time, next.due);
      next.callback();
    }
    this.time = Math.max(this.time, time);
  }

  advance(ms: number): void {
    this.advanceTo(this.time + ms);
  }

  /** When the next timer is due, or undefined when none is set. */
  nextDue(): number | undefined {
    return this.timers.length === 0 ? undefined : Math.min(...this.timers.map((timer) => timer.due));
  }

  pending(): number {
    return this.timers.length;
  }
}
