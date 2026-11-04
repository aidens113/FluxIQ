// "Using what I saved from Tuesday." Said while an attempt works from what an earlier one
// saved. The day is told only where a record gives one.

import { dayWords } from "./day-words.ts";

/** The line; `savedAtMs` is when the saved work, or the earlier attempt, was written. */
export function usingSavedWords(savedAtMs: number | undefined, nowMs: number = Date.now()): string {
  const day = savedAtMs === undefined ? undefined : dayWords(savedAtMs, nowMs);
  return day === undefined ? "Using what I saved." : `Using what I saved from ${day}.`;
}
