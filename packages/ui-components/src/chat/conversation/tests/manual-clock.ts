// A clock the conversation tests move by hand, so the controller's quiet
// retries (`read/retry.ts`) run when a test says, never on a real timer.

import type { ConversationClock } from "../read/index.ts";

export type ManualClock = {
  readonly clock: ConversationClock;
  /** Delays of the retries waiting to run, in the order they were scheduled. */
  pending(): number[];
  /** Moves time on by `ms`, running every retry that falls due, then lets their reads finish. */
  advance(ms: number): Promise<void>;
};

/** Lets every read already on its way finish: the fakes answer within microtasks. */
export function settled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function manualClock(): ManualClock {
  let now = 0;
  let timers: Array<{ at: number; delay: number; run: () => void }> = [];
  return {
    clock: {
      now: () => now,
      schedule(run, ms) {
        const timer = { at: now + ms, delay: ms, run };
        timers.push(timer);
        return () => {
          timers = timers.filter((candidate) => candidate !== timer);
        };
      }
    },
    pending: () => timers.map((timer) => timer.delay),
    async advance(ms) {
      now += ms;
      const due = timers.filter((timer) => timer.at <= now);
      timers = timers.filter((timer) => timer.at > now);
      for (const timer of due) timer.run();
      await settled();
    }
  };
}
