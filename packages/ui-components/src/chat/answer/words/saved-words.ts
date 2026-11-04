// What is saved for next time, in plain words and only what is true: each state says what
// it is, and "so next time is quicker" is claimed only of a saved copy that has worked.

import type { ChatSavedState } from "../../ports/index.ts";

/** The chip's words for `saved`. */
export function savedWords(saved: ChatSavedState): string {
  switch (saved.state) {
    case "ready":
      return "Saved so next time is quicker. It worked last time.";
    case "partly_works":
      return "Saved, and it partly works. I will repair it next time.";
    case "notes_only":
      return "Notes only. I could not save steps, so next time I will start from what I learned.";
    case "needs_you":
      return "Saved, but it needs you before it can run on its own.";
  }
}
