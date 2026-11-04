// The tasks screen's words with no DOM: each state, a row, the order of the list, where a task
// got to, an attempt's line, the steps and where they came from, and what deleting says.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fakeTasks } from "../../../../testing/index.ts";
import type { ChatTaskOutcome } from "../../../../chat/ports/index.ts";
import type { ChatAttemptProvenance } from "../../../../chat/ports/index.ts";
import type { TaskStep } from "../../port.ts";
import { attemptEntry, clockWords, deleteWords, FROM_SAVED, groupTasks, ownWaitingWords, stepRuns, taskActions, taskRow, taskState, whereItGotTo, WORKED_OUT } from "../index.ts";

// A Friday afternoon, local time, so "yesterday", "Tuesday" and "today" read the same wherever the tests run.
const NOW = new Date(2027, 0, 15, 15, 30).getTime();
const REAL = { nowMs: NOW, reportsSpend: true };
const BANNED = /\b(flow|build|built|promoted|judge|judged|candidate|trial|core|failed|failure)\b/iu;

/** `outcome` waiting for `reason`, a string the type of this branch may not know yet. */
function waitingFor(outcome: ChatTaskOutcome, reason: string): ChatTaskOutcome {
  return { ...outcome, attempt: { ...outcome.attempt, waitingFor: reason } as unknown as ChatTaskOutcome["attempt"] };
}

function rows() {
  const tasks = fakeTasks(NOW);
  return Object.fromEntries(Object.entries(tasks).map(([name, task]) => [name, taskRow(task.summary, REAL)]));
}

test("each state is one plain phrase, a tick only for a confirmed result, and never failed", () => {
  const tasks = fakeTasks(NOW);
  const words = Object.fromEntries(Object.entries(tasks).map(([name, task]) => [name, taskState(task.summary.latest)]));
  assert.equal(words.working!.words, "Working");
  assert.equal(words.waiting!.words, "Needs your answer");
  assert.equal(words.interrupted!.words, "Stopped partway. You can carry on.");
  assert.equal(words.keyLocked!.words, "Needs your model key unlocked");
  assert.equal(words.budgetOut!.words, "Ran out of budget");
  assert.equal(words.stopped!.words, "You stopped it");
  assert.equal(words.unconfirmed!.words, "Finished, not confirmed");
  assert.equal(words.done!.words, "Done");
  assert.equal(words.done!.mark, "tick");
  assert.equal(words.doneOnSite!.words, "Finished, not confirmed", "a result that is confirmed but may have been spoiled by an act is not ticked");
  for (const [name, state] of Object.entries(words)) {
    if (state.key !== "done") assert.equal(state.mark, "none", `${name} has no tick`);
    assert.doesNotMatch(state.words, BANNED);
  }
  const person = taskState(waitingFor(tasks.waiting.summary.latest, "person_only_check"));
  assert.equal(person.words, "Needs you on the page");
});

test("a reason this screen does not know is a plain wait, and read as a string", () => {
  const latest = fakeTasks(NOW).waiting.summary.latest;
  const odd = taskState(waitingFor(latest, "something_new"));
  assert.equal(odd.words, "Waiting for you");
  assert.equal(odd.needsPerson, true);
  assert.equal(ownWaitingWords("something_new")?.headline, "Waiting for you");
  assert.equal(ownWaitingWords("permission"), undefined);
  assert.equal(ownWaitingWords("interrupted")?.headline, "Stopped partway");
  assert.match(ownWaitingWords("model_key_locked")!.lead, /Unlock it/u);
});

test("a row says the person's words, the state, the time, how long and what it cost, and the saved line", () => {
  const all = rows();
  assert.equal(all.done!.title, "Find the cheapest kettles on the shop");
  assert.match(all.done!.line, /^15:05 · 18s · \$0\.00 · 2 attempts$/u);
  assert.match(all.done!.saved ?? "", /^Saved today: the steps\. They worked last time\.$/u);
  assert.equal(all.working!.line.includes("$"), false, "no cost is told while it is still working");
  const quiet = taskRow(fakeTasks(NOW).done.summary, { nowMs: NOW, reportsSpend: false });
  assert.equal(quiet.line.includes("$"), false);
  const named = fakeTasks(NOW).done.summary;
  named.title = "   ";
  assert.equal(taskRow(named, REAL).title, "Untitled task");
});

test("the list puts what needs the person first, then days, newest first", () => {
  const groups = groupTasks(Object.values(rows()), NOW);
  assert.deepEqual(groups.map((group) => group.heading), ["Needs you", "Today", "Yesterday", "Tuesday", "Monday", "Sunday"]);
  const needs = groups[0]!.rows.map((row) => row.state.key);
  assert.deepEqual(needs, ["interrupted", "needs_key", "needs_answer"]);
  assert.deepEqual(groups[1]!.rows.map((row) => row.state.key), ["working", "done"]);
  assert.equal(groups[0]!.rows.every((row) => row.state.needsPerson), true);
});

test("where it got to is one sentence with the last step and the count", () => {
  const tasks = fakeTasks(NOW);
  const steps = tasks.done.steps!["attempt-deals-1"]!;
  const done = tasks.done.attempts[1]!.attempt;
  assert.equal(whereItGotTo(done, steps), "Finished in 3 steps. The last one was “Read the first 10 rows”.");
  assert.equal(whereItGotTo(done), "Finished in 31 steps.", "before the steps are read, the attempt's own count");
  assert.equal(whereItGotTo(tasks.interrupted.attempts[0]!.attempt, tasks.interrupted.steps!["attempt-saved-searches-1"]), "It had taken 3 steps when it stopped. The last one was “Read its listings”.");
  assert.match(whereItGotTo(tasks.budgetOut.attempts[0]!.attempt), /^It reached its budget after \d+ steps?\.$/u);
  assert.match(whereItGotTo({ ...tasks.working.attempts[0]!.attempt, liveSteps: 0 }, []), /^It is starting./u);
  assert.equal(whereItGotTo({ ...tasks.stopped.attempts[0]!.attempt, liveSteps: 0 }), "No steps are recorded for this attempt.");
  assert.match(whereItGotTo(tasks.stopped.attempts[0]!.attempt), /^You stopped it after/u);
  assert.match(whereItGotTo(tasks.waiting.attempts[0]!.attempt), /^It had taken [0-9]+ steps so far[.]/u);
});

test("an attempt's line says when, how it ended, what it took, and the comparison with the first time", () => {
  const tasks = fakeTasks(NOW);
  const second = attemptEntry(tasks.done.attempts[0]!, REAL);
  assert.equal(second.when, "Today 15:05");
  assert.equal(second.state.words, "Done");
  assert.equal(second.took, "18s · $0.00");
  assert.equal(second.compared, "This time 18s and $0.00. First time 3m 14s and $1.12.");
  const first = attemptEntry(tasks.done.attempts[1]!, REAL);
  assert.equal(first.when, "Yesterday 12:30");
  assert.equal(first.compared, undefined);
  assert.equal(attemptEntry(tasks.done.attempts[0]!, { nowMs: NOW, reportsSpend: false }).took, "18s");
});

test("steps keep their reasoning, fold the small ones, and mark saved or worked out again only where the kind changes", () => {
  const steps: TaskStep[] = [
    { stepId: "a", atMs: 0, title: "Opened the page", reason: "To start", result: "Loaded" },
    { stepId: "b", atMs: 0, title: "Looked around", quiet: true },
    { stepId: "c", atMs: 0, title: "Looked again", quiet: true },
    { stepId: "d", atMs: 0, title: "Sorted by price" },
    { stepId: "e", atMs: 0, title: "Read the rows" },
    { stepId: "f", atMs: 0, title: "Wrote it down" }
  ];
  const provenance: ChatAttemptProvenance = { route: "x", startedFrom: "y", steps: [
    { position: 1, label: "Opened the page", from: "saved", ran: true },
    { position: 4, label: "Sorted by price", from: "saved", ran: true },
    { position: 5, label: "Read the rows", from: "worked_out", ran: true },
    { position: 6, label: "Wrote it down", from: "worked_out", ran: true }
  ] };
  const marked = stepRuns(steps, provenance);
  assert.deepEqual(marked.map((run) => run.kind), ["step", "quiet", "step", "step", "step"]);
  const headings = marked.map((run) => (run.kind === "step" ? run.entry.heading : undefined));
  assert.deepEqual(headings, [FROM_SAVED, undefined, undefined, WORKED_OUT, undefined]);
  const quiet = marked[1];
  assert.equal(quiet?.kind === "quiet" ? quiet.entries.length : 0, 2);
  assert.equal(marked[0]?.kind === "step" ? marked[0].entry.reason : "", "To start");
  assert.deepEqual(stepRuns(steps).map((run) => (run.kind === "step" ? run.entry.heading : "quiet")), [undefined, "quiet", undefined, undefined, undefined], "no provenance, nothing marked");
  const notRun = stepRuns([{ stepId: "z", atMs: 0, title: "Skipped" }], { route: "x", startedFrom: "y", steps: [{ position: 1, label: "Skipped", from: "saved", ran: false }] });
  assert.equal(notRun[0]?.kind === "step" ? notRun[0].entry.heading : "x", undefined, "a step that did not run is not marked");
});

test("a control is drawn only where the port can carry it", () => {
  const { interrupted, done } = fakeTasks(NOW);
  const full = { list: async () => ({ ok: false as const, sentence: "" }), read: async () => ({ ok: false as const, sentence: "" }), carryOn: async () => ({ ok: false as const, sentence: "" }), rename: async () => ({ ok: false as const, sentence: "" }), remove: async () => ({ ok: false as const, sentence: "" }) };
  assert.deepEqual(taskActions(interrupted.summary, interrupted.attempts[0]!, full, true), { carryOn: true, openInChat: true, rename: true, remove: true });
  assert.deepEqual(taskActions(done.summary, done.attempts[0]!, full, true), { carryOn: false, openInChat: true, rename: true, remove: true }, "Carry on only for an interrupted attempt");
  const bare = { list: full.list, read: full.read };
  assert.deepEqual(taskActions(interrupted.summary, interrupted.attempts[0]!, bare, false), { carryOn: false, openInChat: false, rename: false, remove: false });
  const noChat = { ...done.summary };
  delete noChat.conversationId;
  assert.equal(taskActions(noChat, done.attempts[0]!, full, true).openInChat, false, "no chat to open");
});

test("deleting says what goes and what stays, and the day and time read in local time", () => {
  const words = deleteWords("Order the groceries");
  assert.equal(words.question, "Delete “Order the groceries”?");
  assert.match(words.goes, /attempts/u);
  assert.match(words.stays, /automation or subflow it saved stays/u);
  assert.doesNotMatch(`${words.question} ${words.goes} ${words.stays}`, BANNED);
  assert.equal(clockWords(new Date(2027, 0, 15, 9, 5).getTime()), "09:05");
  assert.equal(clockWords(0), undefined);
});
