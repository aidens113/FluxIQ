// The header's "Using what I saved from Tuesday.", read from a thread's outcomes: said of the
// newest attempt still working, and only while it works from saved work (its path is not
// `explore` and a saved state or an earlier attempt is known).

import { usingSavedFor } from "../answer/index.ts";
import type { ChatTaskOutcome } from "../ports/index.ts";

/** The line for the newest working attempt, or none. */
export function savedOfOutcomes(outcomes: readonly ChatTaskOutcome[], nowMs: number = Date.now()): string | undefined {
  const working = outcomes.filter((outcome) => outcome.attempt.status === "working").at(-1);
  return working === undefined ? undefined : usingSavedFor(working, nowMs);
}
