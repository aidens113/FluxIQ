// What is saved for next time, in plain words and only what is true: when, what (the steps,
// or notes only) and whether they worked. "It worked last time" is said only of a saved copy
// whose record says it worked (`ready`), and nothing here claims next time will be quicker.

import type { ChatSavedState } from "../../ports/index.ts";
import { dayWords } from "./day-words.ts";
import { savedStepsWords } from "./left-out-words.ts";

/** "Saved Tuesday", or "Saved" where the time is not known. */
function savedOn(saved: ChatSavedState, nowMs: number): string {
  const day = dayWords(saved.savedAtMs, nowMs);
  return day === undefined ? "Saved" : `Saved ${day}`;
}

/** The saved line for `saved`, told on the day `nowMs`. */
export function savedWords(saved: ChatSavedState, nowMs: number = Date.now()): string {
  const on = savedOn(saved, nowMs);
  const steps = savedStepsWords(saved);
  switch (saved.state) {
    case "ready":
      return `${on}: ${steps}. They worked last time.`;
    case "partly_works":
      // The saved steps ran this time and one stopped them, which was fixed: never "have not run" (t878).
      if (saved.repaired === true) return `${on}: ${steps}. They ran this time and I fixed the step that stopped them, so next time I will try them with that fix.`;
      return saved.trust === "unproven" && saved.simulation !== "failed"
        ? `${on}: ${steps}. They have not run on their own yet, so next time I will try them and fix what fails.`
        : `${on}: ${steps}. They only partly work, so next time I will fix what fails.`;
    case "notes_only":
      return notesOnlyWords(saved, on);
    case "needs_you":
      return saved.flowId === undefined
        ? `${on}, but it needs you before it can run on its own.`
        : `${on}: ${steps}, but they need you before they can run on their own.`;
  }
}

/** Notes only, said by the reason the record gives: a wait is never a failed save, and a save that failed says so. */
function notesOnlyWords(saved: Extract<ChatSavedState, { state: "notes_only" }>, on: string): string {
  switch (saved.why) {
    case "still_waiting":
      return saved.earlierKept === true
        ? `${on}: this attempt is not finished, and its steps are saved as a Flow when it ends. The steps saved by the earlier attempt are kept.`
        : `${on}: this attempt is not finished, and its steps are saved as a Flow when it ends. No steps are saved yet.`;
    case "not_assembled":
      return `${on}: notes only. The steps I took did not fit together as a Flow, so next time I will start from what I learned.`;
    case "not_saved":
      return `${on}: notes only. Saving the steps failed this time, so next time I will start from what I learned.`;
    default:
      return `${on}: notes only. I could not save steps, so next time I will start from what I learned.`;
  }
}
