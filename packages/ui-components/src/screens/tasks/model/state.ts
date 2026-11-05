// A task's state in one plain phrase, from its newest attempt. A tick only for a confirmed
// result; there is no failed state, and red is never used: the one ending that is not a
// result (a spent budget) is told as it happened, in a warm colour.

import { answerModel } from "../../../chat/answer/index.ts";
import type { ChatTaskOutcome } from "../../../chat/ports/index.ts";
import { waitingReason } from "./waiting.ts";

export type TaskStateKey = "working" | "needs_answer" | "needs_page" | "interrupted" | "needs_key" | "waiting" | "budget_out" | "stopped" | "done" | "unconfirmed";

/** `attention`: the person is wanted. `good`: confirmed. `quiet`: nothing is asked. */
export type TaskState = { key: TaskStateKey; words: string; mark: "tick" | "none"; tone: "attention" | "good" | "quiet" | "plain"; needsPerson: boolean };

function waiting(reason: string): TaskState {
  const base = { mark: "none", tone: "attention", needsPerson: true } as const;
  switch (reason) {
    case "permission":
    case "stuck_in_a_loop":
      return { ...base, key: "needs_answer", words: "Needs your answer" };
    case "person_only_check":
      return { ...base, key: "needs_page", words: "Needs you on the page" };
    case "interrupted":
      return { ...base, key: "interrupted", words: "Stopped partway. You can carry on." };
    case "model_key_locked":
      return { ...base, key: "needs_key", words: "Needs your model key unlocked" };
    default:
      return { ...base, key: "waiting", words: "Waiting for you" };
  }
}

/** A tick only where the answer turn gives one: a result that is confirmed and that no act on the site may have spoiled. */
function confirmed(outcome: ChatTaskOutcome): boolean {
  return answerModel(outcome, { reportsSpend: true, canAddBudget: false })?.check?.mark === "tick";
}

/** The state of `outcome`. */
export function taskState(outcome: ChatTaskOutcome): TaskState {
  const { attempt } = outcome;
  const reason = waitingReason(attempt);
  if (reason !== undefined) return waiting(reason);
  switch (attempt.status) {
    case "working":
      return { key: "working", words: "Working", mark: "none", tone: "plain", needsPerson: false };
    case "budget_out":
      return { key: "budget_out", words: "Ran out of budget", mark: "none", tone: "attention", needsPerson: false };
    case "stopped_by_person":
      return { key: "stopped", words: "You stopped it", mark: "none", tone: "quiet", needsPerson: false };
    case "achieved":
      if (confirmed(outcome)) return { key: "done", words: "Done", mark: "tick", tone: "good", needsPerson: false };
      return { key: "unconfirmed", words: "Finished, not confirmed", mark: "none", tone: "plain", needsPerson: false };
    default:
      return { key: "unconfirmed", words: "Finished, not confirmed", mark: "none", tone: "plain", needsPerson: false };
  }
}
