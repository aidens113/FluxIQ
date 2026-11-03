import type { ActivityTimers } from "./timers";

/** The browser's own clock and timers, for the activity poll. */
export const browserActivityTimers: ActivityTimers = Object.freeze({
  setTimeout: (callback: () => void, delayMs: number) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timer: unknown) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
  now: () => Date.now()
});
