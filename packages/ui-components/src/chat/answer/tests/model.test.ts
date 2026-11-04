// The answer turn's words, with no DOM: each kind, each check state, the one failing
// ending, each wait, and what is said of time and cost.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fakeTaskOutcomes } from "../../../testing/index.ts";
import type { ChatTaskOutcome } from "../../ports/index.ts";
import { answerModel, type AnswerModel } from "../model/index.ts";

const REAL = { reportsSpend: true, canAddBudget: true };
const NO_SPEND = { reportsSpend: false, canAddBudget: true };

function modelOf(outcome: ChatTaskOutcome, options = REAL): AnswerModel {
  const model = answerModel(outcome, options);
  assert.notEqual(model, undefined);
  return model!;
}

const BANNED = /\b(flow|build|judge|core|candidate|trial)\b/iu;

test("rows, confirmed: found N of N, a tick, the first five rows, nothing changed, what was checked, where from, what is saved", () => {
  const model = modelOf(fakeTaskOutcomes().rowsChecked);
  assert.equal(model.kind, "rows");
  assert.equal(model.headline, "Found 10 of 10");
  assert.deepEqual(model.check, { state: "confirmed", mark: "tick", words: "Checked" });
  assert.deepEqual(model.rows?.columns, ["Title", "Price"]);
  assert.equal(model.rows?.rows.length, 5);
  assert.deepEqual(model.rows?.rows[0], ["Blue kettle", "18.5"]);
  assert.equal(model.rows?.collapsedCount, 5);
  assert.equal(model.siteTitle, "On the site: nothing changed");
  assert.equal(model.checked, "Checked: Right columns, cheapest first, no duplicates");
  assert.equal(model.from, "From: 3 results pages on shop.example · 3m 14s · $1.12");
  assert.equal(model.saved, "Saved, and it partly works. I will repair it next time.");
  assert.equal(model.canExport, true);
  assert.equal(model.canRunAgain, true);
  assert.equal(model.compared, undefined);
});

test("only a preview held: it says how many rows are shown and where the rest is", () => {
  const model = modelOf(fakeTaskOutcomes().rowsChecked);
  assert.equal(model.rows?.total, 10);
  assert.equal(model.rows?.expandWords, undefined, "five held, five shown: nothing to open");
  assert.equal(model.rows?.partialNotes?.collapsed, "Showing 5 of 10 rows here. CSV and JSON have every row.");
});

test("more previewed than shown: Show all N opens them in place, and the note follows what shows", () => {
  const outcome = fakeTaskOutcomes().rowsChecked;
  const rows = outcome.result!.rows!;
  rows.previewRows = Array.from({ length: 10 }, (_, index) => ({ title: `Item ${index}`, price: index }));
  const model = modelOf(outcome);
  assert.equal(model.rows?.expandWords, "Show all 10");
  assert.equal(model.rows?.rows.length, 10);
  assert.equal(model.rows?.partialNotes, undefined, "all ten held, all ten found");
  rows.totalRows = 50;
  rows.truncated = true;
  const partial = modelOf(outcome);
  assert.equal(partial.rows?.expandWords, "Show 10 rows");
  assert.equal(partial.rows?.partialNotes?.collapsed, "Showing 5 of 50 rows here. CSV and JSON have every row.");
  assert.equal(partial.rows?.partialNotes?.expanded, "Showing 10 of 50 rows here. CSV and JSON have every row.");
});

test("unverified rows have no tick and say plainly why and ask the person to look", () => {
  const model = modelOf(fakeTaskOutcomes().rowsNotSure);
  assert.deepEqual(model.check, { state: "unverified", mark: "none", words: "Not confirmed. I did not get to check this, so please look to be sure." });
  assert.equal(model.headline.includes("of"), false, "no claim of found-of-found");
});

test("refuted rows are a failed mark and its words, with what failed", () => {
  const model = modelOf(fakeTaskOutcomes().rowsRefuted);
  assert.equal(model.check?.state, "refuted");
  assert.equal(model.check?.mark, "cross");
  assert.equal(model.check?.words, "Did not pass the check");
  assert.equal(model.checked, "What failed: They are not sorted cheapest first");
});

test("done on the site: each lasting act in words from the act record, with its undo and its doubt", () => {
  const model = modelOf(fakeTaskOutcomes().doneOnSite);
  assert.equal(model.kind, "done_on_site");
  assert.equal(model.headline, "Done on the site");
  assert.equal(model.siteTitle, "On the site");
  assert.deepEqual(model.siteLines, [
    "Added the blue kettle to the cart (shop.example, product page). To undo it: Remove it from the cart.",
    "This may have happened, look to be sure: Added the glass jug to the cart (shop.example, product page)."
  ]);
  assert.equal(model.rows, undefined);
  assert.equal(model.canExport, false);
});

test("an undone act and one never done are told as such", () => {
  const outcome = fakeTaskOutcomes().doneOnSite;
  outcome.result!.acts = [
    { id: "a", what: "Added the lamp", where: "shop.example", classes: ["create_new"], state: "undone" },
    { id: "b", what: "Sent the order", where: "", classes: ["send_or_publish"], state: "not_done" }
  ];
  assert.deepEqual(modelOf(outcome).siteLines, ["Added the lamp (shop.example), then it was undone.", "Not done: Sent the order."]);
});

test("a plain answer is the model's words, labelled as the model's", () => {
  const model = modelOf(fakeTaskOutcomes().plainAnswerChecked);
  assert.equal(model.kind, "plain_answer");
  assert.deepEqual(model.text, { label: "In the model's words", text: "The store is open until nine tonight." });
  assert.equal(model.check?.mark, "tick");
  assert.equal(model.saved, "Notes only. I could not save steps, so next time I will start from what I learned.");
});

test("partial: here are the 3 I got, and what is missing", () => {
  const model = modelOf(fakeTaskOutcomes().budgetOutPartial);
  assert.equal(model.kind, "budget_out", "ended by the budget, so it is the budget-out turn");
  const achieved = fakeTaskOutcomes().budgetOutPartial;
  achieved.attempt = { ...achieved.attempt, status: "achieved" };
  const partial = modelOf(achieved);
  assert.equal(partial.kind, "partial");
  assert.equal(partial.headline, "Here are the 3 I got, and what is missing");
  assert.equal(partial.missing, "Missing: The rest of the listings past the first page");
  assert.equal(partial.check?.mark, "none");
});

test("budget out is the one failing shape: the budget, what I got (not confirmed), what I saved, one action with its amount", () => {
  const model = modelOf(fakeTaskOutcomes().budgetOutPartial);
  assert.equal(model.headline, "I reached this task's budget.");
  assert.equal(model.lead, "It spent $5.00 of $5.00.");
  assert.equal(model.gotLine, "What I got: 3 rows.");
  assert.equal(model.check?.mark, "none");
  assert.equal(model.saved, "Saved, and it partly works. I will repair it next time.");
  assert.deepEqual(model.addBudget, { addUsd: 5, words: "Add $5.00 and carry on" });
  assert.equal(modelOf(fakeTaskOutcomes().rowsRefuted).check?.mark, "cross", "a refuted result is shown as failed, not hidden");
});

test("budget out: no result is said so; no saved record says nothing is saved; a port without the method has no button", () => {
  const outcome = fakeTaskOutcomes().budgetOutPartial;
  delete outcome.result;
  delete outcome.saved;
  const model = modelOf(outcome);
  assert.equal(model.gotLine, "I did not get a result yet.");
  assert.equal(model.saved, "Nothing saved yet.");
  assert.equal(model.rows, undefined);
  assert.equal(modelOf(outcome, { reportsSpend: true, canAddBudget: false }).addBudget, undefined);
});

test("waiting for permission, for a check only the person can do: what it waits for, in plain words, and no ending", () => {
  const permission = modelOf(fakeTaskOutcomes().waitingForPermission);
  assert.equal(permission.kind, "waiting");
  assert.equal(permission.headline, "Waiting for your permission");
  assert.match(permission.lead ?? "", /OK/u);
  assert.equal(permission.stuckActions, false);
  assert.equal(permission.canRunAgain, false);
  assert.equal(permission.from, undefined);
  const check = modelOf(fakeTaskOutcomes().waitingForPerson);
  assert.equal(check.headline, "Waiting for you");
  assert.match(check.lead ?? "", /Continue/u);
  assert.equal(check.stuckActions, false);
});

test("stuck in a loop: says so, shows what it has, and offers the three actions", () => {
  const model = modelOf(fakeTaskOutcomes().stuckInALoop);
  assert.equal(model.headline, "I keep getting stuck on this");
  assert.equal(model.lead, "I stopped spending to ask you. I have nothing to show yet.", "the fixture holds only what is missing");
  const withRows = fakeTaskOutcomes().rowsNotSure;
  withRows.attempt = { ...withRows.attempt, status: "waiting_for_person", waitingFor: "stuck_in_a_loop" };
  assert.equal(modelOf(withRows).lead, "I stopped spending to ask you. Here is what I have so far.");
  assert.equal(model.missing, "Missing: Everything past the first page");
  assert.equal(model.stuckActions, true);
  assert.equal(model.canRunAgain, false);
});

test("stopped by the person: one plain line and what it got", () => {
  const model = modelOf(fakeTaskOutcomes().stoppedByPerson);
  assert.equal(model.kind, "stopped");
  assert.equal(model.headline, "Stopped");
  assert.equal(model.lead, "It had not found anything yet.");
  assert.equal(model.check, undefined, "nothing found, nothing to check");
  const withRows = fakeTaskOutcomes().rowsNotSure;
  withRows.attempt = { ...withRows.attempt, status: "stopped_by_person" };
  const found = modelOf(withRows);
  assert.equal(found.lead, "Here is what I got before you stopped it.");
  assert.equal(found.rows?.rows.length, 2);
});

test("working has no answer turn, and neither has an ended attempt with no result", () => {
  assert.equal(answerModel(fakeTaskOutcomes().working, REAL), undefined);
  const outcome = fakeTaskOutcomes().rowsChecked;
  delete outcome.result;
  assert.equal(answerModel(outcome, REAL), undefined);
});

test("the second attempt says this time and first time, with cost", () => {
  const model = modelOf(fakeTaskOutcomes().secondAttemptFromSaved);
  assert.equal(model.compared, "This time 18s and $0.00. First time 3m 14s and $1.12.");
  assert.equal(model.saved, "Saved so next time is quicker. It worked last time.");
  assert.equal(model.from, "From: 3 results pages on shop.example · 18s · $0.00");
});

test("a port that does not report spend: nothing about cost or calls, time still said", () => {
  const second = modelOf(fakeTaskOutcomes().secondAttemptFromSaved, NO_SPEND);
  assert.equal(second.compared, "This time 18s. First time 3m 14s.");
  assert.equal(second.from, "From: 3 results pages on shop.example · 18s");
  const budget = modelOf(fakeTaskOutcomes().budgetOutPartial, NO_SPEND);
  assert.equal(budget.lead, undefined);
  assert.equal(budget.addBudget?.words, "Add budget and carry on");
  for (const outcome of Object.values(fakeTaskOutcomes())) {
    const made = answerModel(outcome, NO_SPEND);
    assert.equal(/\$|calls?\b/u.test(JSON.stringify(made ?? {})), false);
  }
});

test("time is whole seconds: 1m 12s, and hours", () => {
  const outcome = fakeTaskOutcomes().rowsChecked;
  outcome.attempt = { ...outcome.attempt, spend: { ...outcome.attempt.spend, ms: 72_000, usd: 0.34 } };
  assert.equal(modelOf(outcome).from, "From: 3 results pages on shop.example · 1m 12s · $0.34");
  outcome.attempt = { ...outcome.attempt, spend: { ...outcome.attempt.spend, ms: 3_900_000 } };
  assert.match(modelOf(outcome).from ?? "", /1h 5m/u);
});

test("each saved state says only what is true, and a Run again is for ended attempts", () => {
  const outcome = fakeTaskOutcomes().rowsChecked;
  outcome.saved = { state: "needs_you", trust: "unproven", savedAtMs: 1 };
  assert.equal(modelOf(outcome).saved, "Saved, but it needs you before it can run on its own.");
  delete outcome.saved;
  assert.equal(modelOf(outcome).saved, undefined);
});

test("no person-facing word is an internal one, in any state", () => {
  for (const outcome of Object.values(fakeTaskOutcomes())) {
    const model = answerModel(outcome, REAL);
    if (model === undefined) continue;
    const words = JSON.stringify({ ...model, taskId: undefined, attemptId: undefined, projectId: undefined, rows: undefined });
    assert.equal(BANNED.test(words), false, words);
  }
});

test("an act that may have landed takes the tick away: the check is not confirmed and says to look", () => {
  const outcome = fakeTaskOutcomes().doneOnSite;
  assert.equal(outcome.result!.label, "confirmed");
  assert.ok(outcome.result!.acts.some((act) => act.state === "may_have_landed"));
  const model = modelOf(outcome);
  assert.equal(model.check!.state, "unverified");
  assert.equal(model.check!.mark, "none");
  assert.match(model.check!.words, /may have happened/u);
  assert.match(model.check!.words, /look to be sure/u);
  assert.match(model.checked ?? "", /^Meant to check:/u);

  const settled = structuredClone(outcome);
  settled.result!.acts = settled.result!.acts.map((act) => (act.state === "may_have_landed" ? { ...act, state: "landed" as const } : act));
  assert.deepEqual(modelOf(settled).check, { state: "confirmed", mark: "tick", words: "Checked" });

  const rows = structuredClone(fakeTaskOutcomes().rowsChecked);
  rows.result!.acts = [{ id: "a1", what: "Added a thing", where: "the site", classes: ["modify_existing"], state: "may_have_landed" }];
  assert.equal(modelOf(rows).headline, "Found 10 rows", "no \"of\" without the tick");
});

test("Run again never repeats a lasting act unannounced: it says so, and a budget-out that did something gives way to Add budget and carry on alone", () => {
  const done = modelOf(fakeTaskOutcomes().doneOnSite);
  assert.equal(done.canRunAgain, true);
  assert.equal(done.runAgainNote, "Running this again may repeat what was done on the site.");
  assert.equal(modelOf(fakeTaskOutcomes().rowsChecked).runAgainNote, undefined, "a read-only task has nothing to repeat");

  const out = structuredClone(fakeTaskOutcomes().budgetOutPartial);
  out.result!.acts = [{ id: "a1", what: "Sent a message", where: "the site", classes: ["send_or_publish"], state: "landed" }];
  const model = modelOf(out);
  assert.equal(model.canRunAgain, false);
  assert.ok(model.addBudget, "Add budget and carry on stays");
  assert.equal(modelOf(out, { reportsSpend: true, canAddBudget: false }).canRunAgain, true, "with no way to carry on, Run again stays, with its note");
  assert.equal(modelOf(fakeTaskOutcomes().budgetOutPartial).canRunAgain, true, "a budget-out that did nothing on the site can run again");
});

test("a run that finished and was never judged (not a contract status) is told as found and not confirmed, with no tick", () => {
  const outcome = structuredClone(fakeTaskOutcomes().rowsChecked);
  outcome.attempt = { ...outcome.attempt, status: "finished_unchecked" };
  outcome.result = { ...outcome.result!, label: "unverified", timesChecked: 0 };
  const model = modelOf(outcome, NO_SPEND);
  assert.equal(model.headline, "Found 10 rows");
  assert.equal(model.check?.mark, "none");
  assert.equal(model.canRunAgain, true);
});
