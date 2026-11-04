// What is saved for next time, in plain words and only what is true: when, what (the steps,
// or notes only) and whether they worked. "It worked last time" is said only of a saved copy
// whose record says it worked (`ready`), and nothing here claims next time will be quicker.

import type { ChatSavedState } from "../../ports/index.ts";
import { dayWords } from "./day-words.ts";

/** "Saved Tuesday", or "Saved" where the time is not known. */
function savedOn(saved: ChatSavedState, nowMs: number): string {
  const day = dayWords(saved.savedAtMs, nowMs);
  return day === undefined ? "Saved" : `Saved ${day}`;
}

/** The saved line for `saved`, told on the day `nowMs`. */
export function savedWords(saved: ChatSavedState, nowMs: number = Date.now()): string {
  const on = savedOn(saved, nowMs);
  switch (saved.state) {
    case "ready":
      return `${on}: the steps. They worked last time.`;
    case "partly_works":
      return `${on}: the steps. They only partly work, so next time I will fix what changed.`;
    case "notes_only":
      return `${on}: notes only. I could not save steps, so next time I will start from what I learned.`;
    case "needs_you":
      return saved.flowId === undefined
        ? `${on}, but it needs you before it can run on its own.`
        : `${on}: the steps, but they need you before they can run on their own.`;
  }
}
