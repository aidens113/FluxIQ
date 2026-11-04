// One attempt as a line of the timeline: when, how it ended, how long, what it cost where the
// cost is real, and how it went against the one before ("This time 18s and $0.00. First time
// 3m 14s and $1.12."). Said as it is, never as better or worse.

import { comparedWords, costWords, timeWords } from "../../../chat/answer/words/index.ts";
import type { ChatTaskOutcome } from "../../../chat/ports/index.ts";
import { clockWords } from "./clock-words.ts";
import { dayHeading } from "./day-heading.ts";
import { taskState, type TaskState } from "./state.ts";

export type AttemptEntry = {
  attemptId: string;
  ordinal: number;
  /** "Tuesday 14:05". */
  when: string;
  state: TaskState;
  /** "3m 14s · $1.12", whatever of it is known. */
  took: string;
  compared?: string;
};

export type AttemptEntryOptions = { nowMs: number; reportsSpend: boolean };

/** `outcome` as a timeline entry. */
export function attemptEntry(outcome: ChatTaskOutcome, options: AttemptEntryOptions): AttemptEntry {
  const { attempt } = outcome;
  const when = [dayHeading(attempt.startedAtMs, options.nowMs), clockWords(attempt.startedAtMs)].filter((part) => part !== undefined).join(" ");
  const took = [timeWords(attempt), attempt.status === "working" ? undefined : costWords(attempt, options.reportsSpend)].filter((part): part is string => part !== undefined);
  const entry: AttemptEntry = { attemptId: attempt.attemptId, ordinal: attempt.ordinal, when, state: taskState(outcome), took: took.join(" · ") };
  const compared = comparedWords(attempt, outcome.comparedTo, options.reportsSpend);
  if (compared !== undefined) entry.compared = compared;
  return entry;
}
