// The time the activity pacer and the fan-out gate read, injected so their
// rules are tested against a clock the test moves rather than the wall clock.

export type ActivityTimer = unknown;

export type ActivityClock = {
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, delayMs: number) => ActivityTimer;
  readonly clearTimeout: (timer: ActivityTimer) => void;
};

/** The service worker's own clock. */
export const systemActivityClock: ActivityClock = Object.freeze({
  now: () => Date.now(),
  setTimeout: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
  clearTimeout: (timer: ActivityTimer) => clearTimeout(timer as ReturnType<typeof setTimeout>)
});
