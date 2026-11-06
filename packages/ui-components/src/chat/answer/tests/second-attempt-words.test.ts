// What is saved, how the second attempt went, and how it compares, in a person's words:
// only what the records say, and never a boast.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fakeTaskOutcomes } from "../../../testing/index.ts";
import type { ChatSavedState, ChatTaskAttempt } from "../../ports/index.ts";
import { answerModel } from "../model/index.ts";
import { comparedWords, dayWords, pathWords, savedWords, usingSavedFor, usingSavedWords } from "../words/index.ts";

const BASE = 1_800_000_000_000;
const DAY = 86_400_000;
const NOW = BASE + 9 * DAY + 60_000;

test("the day is today, yesterday, a weekday within the week, or a date; not a time that is not real", () => {
  assert.equal(dayWords(NOW - 60_000, NOW), "today");
  assert.equal(dayWords(NOW - DAY, NOW), "yesterday");
  assert.match(dayWords(NOW - 3 * DAY, NOW) ?? "", /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/u);
  assert.match(dayWords(NOW - 12 * DAY, NOW) ?? "", /^\d{1,2} [A-Z][a-z]{2}$/u);
  assert.equal(dayWords(0, NOW), undefined);
  assert.equal(dayWords(Number.NaN, NOW), undefined);
});

test("each saved state names when and what, and only a copy that worked says it did", () => {
  const at = NOW - DAY;
  const states: ChatSavedState[] = [
    { state: "ready", trust: "provisional", flowId: "f", savedAtMs: at, lastWorkedAtMs: at },
    { state: "partly_works", trust: "unproven", flowId: "f", savedAtMs: at },
    { state: "notes_only", trust: "unproven", savedAtMs: at },
    { state: "needs_you", trust: "unproven", flowId: "f", savedAtMs: at },
    { state: "needs_you", trust: "unproven", savedAtMs: at }
  ];
  const lines = states.map((state) => savedWords(state, NOW));
  assert.deepEqual(lines, [
    "Saved yesterday: the steps. They worked last time.",
    "Saved yesterday: the steps. They have not run on their own yet, so next time I will try them and fix what fails.",
    "Saved yesterday: notes only. I could not save steps, so next time I will start from what I learned.",
    "Saved yesterday: the steps, but they need you before they can run on their own.",
    "Saved yesterday, but it needs you before it can run on its own."
  ]);
  for (const line of lines) assert.doesNotMatch(line, /quicker|faster|cheaper/iu);
  assert.equal(savedWords({ state: "notes_only", trust: "unproven", savedAtMs: 0 }, NOW).startsWith("Saved: notes only"), true, "no usable time, no day");
});

test("saved steps that ran this time and had the step that stopped them fixed never say they have not run (t878)", () => {
  const at = NOW - 60_000;
  const line = savedWords({ state: "partly_works", trust: "unproven", flowId: "f", savedAtMs: at, repaired: true }, NOW);
  assert.equal(line, "Saved today: the steps. They ran this time and I fixed the step that stopped them, so next time I will try them with that fix.");
  assert.doesNotMatch(line, /not run/iu);
  assert.doesNotMatch(savedWords({ state: "partly_works", trust: "unproven", flowId: "f", savedAtMs: at, simulation: "failed", repaired: true }, NOW), /only partly work|not run/iu, "the repair is what happened, whatever the recording said");
});

test("a budget out says what it saved in the same words", () => {
  const outcome = fakeTaskOutcomes().budgetOutPartial;
  const said = answerModel(outcome, { reportsSpend: true, canAddBudget: true, nowMs: outcome.saved!.savedAtMs + 60_000 })!;
  assert.match(said.saved ?? "", /^Saved today: the steps\./u);
});

test("using what I saved names the day when a record gives one, and only for a path that is not explore", () => {
  assert.equal(usingSavedWords(NOW - DAY, NOW), "Using what I saved from yesterday.");
  assert.equal(usingSavedWords(undefined, NOW), "Using what I saved.");
  const second = fakeTaskOutcomes().secondAttemptFromSaved;
  assert.equal(usingSavedFor(second, second.attempt.endedAtMs! + 60_000), "Using what I saved from yesterday.");
  assert.equal(usingSavedFor(fakeTaskOutcomes().rowsChecked, NOW), undefined);
  const alone = fakeTaskOutcomes().secondAttemptFromSaved;
  delete alone.saved;
  delete alone.comparedTo;
  assert.equal(usingSavedFor(alone, NOW), undefined);
});

test("how it went is said from the path alone", () => {
  assert.equal(pathWords("explore", "achieved"), undefined);
  assert.equal(pathWords("run_flow", "achieved"), "Used what I saved. No steps had to be worked out again.");
  assert.equal(pathWords("run_flow", "budget_out"), "Used what I saved.", "a budget-out straight after a run reads run_flow, and proves nothing about the rest");
  assert.equal(pathWords("run_flow", "stopped_by_person"), "Used what I saved.");
  assert.equal(pathWords("run_flow_then_repair", "achieved"), "Used what I saved, and fixed a step that had changed.");
  assert.equal(pathWords("run_flow_then_explore", "achieved"), "Used what I saved as far as it went, then worked out the rest.");
  const second = fakeTaskOutcomes().secondAttemptFromSaved;
  const model = answerModel(second, { reportsSpend: true, canAddBudget: false, nowMs: NOW })!;
  assert.equal(model.how, "Used what I saved. No steps had to be worked out again.");
  assert.equal(answerModel(fakeTaskOutcomes().rowsChecked, { reportsSpend: true, canAddBudget: false, nowMs: NOW })!.how, undefined);
});

test("the comparison tells the numbers as they are: slower and dearer too, time only without cost, nothing unless this one finished", () => {
  const second = fakeTaskOutcomes().secondAttemptFromSaved;
  const first = second.comparedTo!;
  assert.equal(comparedWords(second.attempt, first, true), "This time 18s and $0.00. First time 3m 14s and $1.12.");
  assert.equal(comparedWords(second.attempt, first, false), "This time 18s. First time 3m 14s.");
  const slower = { ...second.attempt, spend: { ...second.attempt.spend, ms: 400_000, usd: 2.5 } };
  assert.equal(comparedWords(slower, first, true), "This time 6m 40s and $2.50. First time 3m 14s and $1.12.");
  assert.equal(comparedWords(slower, { ...first, ordinal: 2 }, false), "This time 6m 40s. Last time 3m 14s.");
  const unknownTime = { ...first, spend: { ...first.spend, ms: 0 } } as ChatTaskAttempt;
  delete (unknownTime as { endedAtMs?: number }).endedAtMs;
  assert.equal(comparedWords(second.attempt, unknownTime, true), undefined, "a time that is not known is not told");
  const ranOut = { ...first, status: "budget_out" } as ChatTaskAttempt;
  assert.equal(comparedWords(second.attempt, ranOut, true), "This time 18s and $0.00. First time it ran out of budget after 3m 14s and $1.12.");
  assert.equal(comparedWords({ ...second.attempt, status: "budget_out" }, first, true), undefined, "an attempt that did not finish is not set against a finished one");
  assert.doesNotMatch(comparedWords(slower, first, true) ?? "", /faster|quicker|cheaper|better|saved you/iu);
});
