// A person's tasks in each state the tasks screen draws, for building it with no Core behind
// it: confirmed and done twice, working, stopped partway, out of budget, waiting for a
// permission, for a locked model key, finished and not confirmed, and stopped by the person.
// Times are set against `nowMs` so the days read naturally; spend and steps are invented.

import type { ChatTaskAttempt, ChatTaskOutcome } from "../../chat/ports/index.ts";
import type { TaskStep, TaskSummary } from "../../screens/tasks/index.ts";
import { fakeTaskOutcomes } from "../results/index.ts";

/** One task with its attempts (newest first) and what a read of their steps answers. */
export type FakeTask = {
  summary: TaskSummary;
  attempts: ChatTaskOutcome[];
  steps?: Record<string, TaskStep[]>;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `outcome` moved to start at `startedAtMs`, keeping how long it took and what it saved. */
function movedTo(outcome: ChatTaskOutcome, startedAtMs: number): ChatTaskOutcome {
  const copy = structuredClone(outcome);
  const shift = startedAtMs - copy.attempt.startedAtMs;
  copy.attempt.startedAtMs = startedAtMs;
  if (copy.attempt.endedAtMs !== undefined) copy.attempt.endedAtMs += shift;
  if (copy.saved !== undefined) {
    copy.saved.savedAtMs += shift;
    if (copy.saved.state === "ready") copy.saved.lastWorkedAtMs += shift;
  }
  return copy;
}

function summaryOf(title: string, attempts: readonly ChatTaskOutcome[], conversationId: string | undefined): TaskSummary {
  const latest = attempts[0]!;
  const { attempt } = latest;
  const summary: TaskSummary = { taskId: attempt.taskId, projectId: attempt.projectId, title, latest, attemptCount: attempts.length, updatedAtMs: attempt.endedAtMs ?? attempt.startedAtMs };
  if (attempt.flowId !== undefined) summary.flowId = attempt.flowId;
  if (conversationId !== undefined) summary.conversationId = conversationId;
  return summary;
}

function stepsOf(attemptId: string, titles: ReadonlyArray<[title: string, reason?: string | undefined, result?: string | undefined]>, atMs: number, quietAfter?: number): TaskStep[] {
  return titles.map(([title, reason, result], index) => {
    const step: TaskStep = { stepId: `${attemptId}-step-${index + 1}`, atMs: atMs + index * 4_000, title };
    if (reason !== undefined) step.reason = reason;
    if (result !== undefined) step.result = result;
    if (quietAfter !== undefined && index === quietAfter) step.quiet = true;
    return step;
  });
}

/** Every state, made fresh, so a test may change what it is given. `nowMs` is when "now" is. */
export function fakeTasks(nowMs: number): Record<"done" | "working" | "interrupted" | "budgetOut" | "waiting" | "keyLocked" | "unconfirmed" | "stopped" | "doneOnSite", FakeTask> {
  const outcomes = fakeTaskOutcomes();
  const first = movedTo(outcomes.rowsChecked, nowMs - DAY - 3 * HOUR);
  const second = movedTo(outcomes.secondAttemptFromSaved, nowMs - 25 * MINUTE);
  second.comparedTo = structuredClone(first.attempt) as ChatTaskAttempt;
  const working = movedTo(outcomes.working, nowMs - 2 * MINUTE);
  const interrupted = movedTo(outcomes.waitingForPerson, nowMs - HOUR);
  interrupted.attempt = { ...interrupted.attempt, taskId: "task-saved-searches", attemptId: "attempt-saved-searches-1", flowId: "flow-saved-searches", status: "waiting_for_person", waitingFor: "interrupted" } as unknown as ChatTaskOutcome["attempt"];
  interrupted.saved = { state: "needs_you", trust: "unproven", flowId: "flow-saved-searches", savedAtMs: nowMs - HOUR + 30_000 };
  const keyLocked = movedTo(outcomes.waitingForPerson, nowMs - 2 * HOUR);
  keyLocked.attempt = { ...keyLocked.attempt, taskId: "task-news-summary", attemptId: "attempt-news-summary-1", flowId: "flow-news-summary", status: "waiting_for_person", waitingFor: "model_key_locked" } as unknown as ChatTaskOutcome["attempt"];
  keyLocked.saved = { state: "needs_you", trust: "unproven", flowId: "flow-news-summary", savedAtMs: nowMs - 2 * HOUR + 30_000 };
  const unconfirmed = movedTo(outcomes.plainAnswerChecked, nowMs - 3 * DAY);
  if (unconfirmed.result !== undefined) unconfirmed.result.label = "unverified";
  const budgetOut = movedTo(outcomes.budgetOutPartial, nowMs - DAY - HOUR);
  budgetOut.attempt.liveSteps = 14;
  const waiting = movedTo(outcomes.waitingForPermission, nowMs - 3 * HOUR);
  const stopped = movedTo(outcomes.stoppedByPerson, nowMs - 5 * DAY);
  const doneOnSite = movedTo(outcomes.doneOnSite, nowMs - 4 * DAY);
  return {
    done: {
      summary: summaryOf("Find the cheapest kettles on the shop", [second, first], "conv-deals"),
      attempts: [{ ...second, provenance: { route: "saved", startedFrom: "the saved steps", steps: [{ position: 1, label: "Opened the shop's kettle page", from: "saved", ran: true }, { position: 2, label: "Sorted by price, lowest first", from: "saved", ran: true }, { position: 3, label: "Read the first 10 rows", from: "worked_out", ran: true }] } }, first],
      steps: {
        "attempt-deals-2": stepsOf("attempt-deals-2", [["Opened the shop's kettle page", "Started from the saved steps.", "Kettles, 24 results"], ["Sorted by price, lowest first", "The task asks for the cheapest.", "Sorted"], ["Read the first 10 rows", undefined, "10 rows"]], second.attempt.startedAtMs),
        "attempt-deals-1": stepsOf("attempt-deals-1", [["Opened the shop's kettle page", "No saved steps yet, so I looked at the page.", "Kettles, 24 results"], ["Looked at the page's layout", undefined, undefined], ["Sorted by price, lowest first", "The task asks for the cheapest.", "Sorted"], ["Read the first 10 rows", "Ten rows is what was asked for.", "10 rows"]], first.attempt.startedAtMs, 1)
      }
    },
    working: { summary: summaryOf("Collect the new job posts every morning", [working], "conv-jobs"), attempts: [working], steps: { "attempt-jobs-1": stepsOf("attempt-jobs-1", [["Opened the job board", "That is where the posts are.", "Board loaded"], ["Filtered to today", undefined, "14 posts"]], working.attempt.startedAtMs) } },
    interrupted: { summary: summaryOf("Check my saved searches for new listings", [interrupted], "conv-searches"), attempts: [interrupted], steps: { "attempt-saved-searches-1": stepsOf("attempt-saved-searches-1", [["Opened the saved searches page", "To see which searches are saved.", "3 searches"], ["Opened the first search", undefined, "8 new listings"], ["Read its listings", "To note what is new.", "8 rows read"]], interrupted.attempt.startedAtMs) } },
    budgetOut: { summary: summaryOf("Copy every listing in the bikes category", [budgetOut], "conv-bikes"), attempts: [budgetOut] },
    waiting: { summary: summaryOf("Order the weekly groceries", [waiting], "conv-order"), attempts: [waiting] },
    keyLocked: { summary: summaryOf("Summarise today's news", [keyLocked], "conv-news-summary"), attempts: [keyLocked] },
    unconfirmed: { summary: summaryOf("What time does the shop close on Sundays?", [unconfirmed], "conv-hours"), attempts: [unconfirmed] },
    stopped: { summary: summaryOf("Read the headlines", [stopped], undefined), attempts: [stopped] },
    doneOnSite: { summary: summaryOf("Add a blue kettle to my basket", [doneOnSite], "conv-cart"), attempts: [doneOnSite] }
  };
}
