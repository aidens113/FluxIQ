// Whether an attempt is working from what was saved, and the line that says so. Only a
// path that is not `explore` uses saved work, and only where a record shows something was
// saved or an earlier attempt ran. The day is the earlier attempt's end where it is known
// (that is when the saved work was last written for this one), else the saved record's.

import type { ChatTaskOutcome } from "../../ports/index.ts";
import { usingSavedWords } from "./using-saved-words.ts";

/** "Using what I saved from Tuesday.", or none when the outcome does not use saved work. */
export function usingSavedFor(outcome: ChatTaskOutcome, nowMs: number = Date.now()): string | undefined {
  if (outcome.attempt.path === "explore") return undefined;
  if (outcome.saved === undefined && outcome.comparedTo === undefined) return undefined;
  return usingSavedWords(outcome.comparedTo?.endedAtMs ?? outcome.saved?.savedAtMs, nowMs);
}
