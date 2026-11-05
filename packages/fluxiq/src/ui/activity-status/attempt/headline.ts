import { ACTIVITY_ATTEMPT_WORDS } from "./words.ts";

const ENDINGS: ReadonlySet<string> = new Set([
  ACTIVITY_ATTEMPT_WORDS.finished,
  ACTIVITY_ATTEMPT_WORDS.budget,
  ACTIVITY_ATTEMPT_WORDS.stopped,
  ACTIVITY_ATTEMPT_WORDS.waiting,
  ACTIVITY_ATTEMPT_WORDS.setup
]);

/**
 * The headline of an attempt's activity once it settled (`outcome` done or failed) or while it
 * works (null): the ending its settling row says, or "Finished" for a done row that says none.
 */
export function activityAttemptHeadline(outcome: "done" | "failed" | null, label: string, stopped: boolean): string {
  if (stopped) return ACTIVITY_ATTEMPT_WORDS.stopped;
  if (outcome === null) return ACTIVITY_ATTEMPT_WORDS.working;
  if (outcome === "done") return ENDINGS.has(label) ? label : ACTIVITY_ATTEMPT_WORDS.finished;
  return label === ACTIVITY_ATTEMPT_WORDS.budget ? label : ACTIVITY_ATTEMPT_WORDS.unfinished;
}
