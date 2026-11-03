/** The clock and timers the activity poll and the paced status run on, so a test drives them. */
export type ActivityTimers = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(timer: unknown): void;
  now(): number;
};
