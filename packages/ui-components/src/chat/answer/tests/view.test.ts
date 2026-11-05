// The answer turn as drawn: every kind, the tick rule, Show all, the exports, the budget
// action, the host's callbacks, and that a re-read which changes nothing changes nothing.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeChatResultsPort, fake, fakeTaskOutcomes, withFakeDocument, type FakeElement } from "../../../testing/index.ts";
import type { ChatTaskOutcome } from "../../ports/index.ts";
import { createAnswerView, type AnswerHost } from "../index.ts";

// A day and a minute after the first attempts began (1_800_000_000_000), so their saved lines read "yesterday".
const NOW = 1_800_000_000_000 + 86_400_000 + 60_000;

function draw(outcome: ChatTaskOutcome, host: AnswerHost = {}) {
  const view = createAnswerView({ now: () => NOW, ...host });
  assert.equal(view.update(outcome), true);
  return { view, root: fake(view.element) };
}

function buttons(root: FakeElement): FakeElement[] {
  return root.querySelectorAll("button");
}

function button(root: FakeElement, action: string): FakeElement {
  const found = buttons(root).find((candidate) => candidate.getAttribute("data-action") === action);
  assert.notEqual(found, undefined, `a ${action} button`);
  return found!;
}

const hasButton = (root: FakeElement, action: string): boolean => buttons(root).some((candidate) => candidate.getAttribute("data-action") === action);
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const text = (root: FakeElement, className: string): string[] => root.byClass(className).map((element) => element.textContent);

test("rows: headline, tick, a table with headers and the first five rows, the lines, and the saved chip", async () => {
  await withFakeDocument(() => {
    const results = createFakeChatResultsPort({ outcomes: [fakeTaskOutcomes().rowsChecked] });
    const { root } = draw(fakeTaskOutcomes().rowsChecked, { results, onWhatIDid: () => undefined });
    assert.equal(root.getAttribute("data-kind"), "rows");
    assert.deepEqual(text(root, "answer-headline"), ["Found 10 of 10"]);
    assert.equal(root.byClass("answer-mark").length, 1);
    assert.equal(root.byClass("answer-mark")[0]!.textContent, "✓");
    assert.deepEqual(text(root, "answer-check-words"), ["Checked"]);
    const table = root.querySelectorAll("table")[0]!;
    assert.equal(table.getAttribute("aria-label"), "Rows found");
    assert.deepEqual(root.querySelectorAll("th").map((cell) => cell.textContent), ["Title", "Price"]);
    assert.equal(root.byClass("answer-row").length, 5);
    assert.equal(root.byClass("answer-table-scroll")[0]!.getAttribute("tabindex"), "0");
    assert.deepEqual(text(root, "answer-note"), ["Showing 5 of 10 rows here. CSV and JSON have every row."]);
    assert.deepEqual(text(root, "answer-saved"), ["Saved yesterday: the steps. They only partly work, so next time I will fix what changed."]);
    const lines = text(root, "answer-line");
    assert.ok(lines.includes("On the site: I recorded no changes"));
    assert.ok(lines.includes("Checked: Right columns, cheapest first, no duplicates"));
    assert.ok(lines.includes("From: 3 results pages on shop.example · 3m 14s · $1.12"));
    for (const action of ["export-csv", "export-json", "run-again", "what-i-did"]) assert.ok(hasButton(root, action), action);
    assert.equal(hasButton(root, "toggle-rows"), false, "five held, five shown");
    assert.equal(button(root, "export-csv").getAttribute("aria-label"), "Download the rows as CSV");
    assert.equal(buttons(root).every((candidate) => candidate.getAttribute("type") === "button"), true);
  });
});

test("Show all opens every previewed row in place, survives a re-read, and Show fewer closes it", async () => {
  await withFakeDocument(() => {
    const outcome = fakeTaskOutcomes().rowsChecked;
    outcome.result!.rows!.previewRows = Array.from({ length: 10 }, (_, index) => ({ title: `Item ${index}`, price: index }));
    const { view, root } = draw(outcome, { results: createFakeChatResultsPort() });
    assert.equal(root.byClass("answer-row").length, 5);
    assert.equal(button(root, "toggle-rows").textContent, "Show all 10");
    assert.equal(button(root, "toggle-rows").getAttribute("aria-expanded"), "false");
    button(root, "toggle-rows").dispatch("click");
    assert.equal(root.byClass("answer-row").length, 10);
    assert.equal(button(root, "toggle-rows").textContent, "Show fewer");
    assert.equal(button(root, "toggle-rows").getAttribute("aria-expanded"), "true");
    view.update(structuredClone(outcome));
    assert.equal(root.byClass("answer-row").length, 10, "a re-read of the same answer keeps it open");
    assert.equal(fake(view.element), root, "and keeps its element");
    button(root, "toggle-rows").dispatch("click");
    assert.equal(root.byClass("answer-row").length, 5);
  });
});

test("a re-read that changes nothing leaves the card's elements alone; a change redraws in the same element", async () => {
  await withFakeDocument(() => {
    const outcome = fakeTaskOutcomes().rowsChecked;
    const { view, root } = draw(outcome);
    const table = root.byClass("answer-table-scroll")[0]!;
    view.update(structuredClone(outcome));
    assert.equal(root.byClass("answer-table-scroll")[0], table, "same table element: no flicker");
    outcome.result!.label = "refuted";
    view.update(outcome);
    assert.equal(fake(view.element), root);
    assert.deepEqual(text(root, "answer-check-words"), ["Did not pass the check"]);
  });
});

test("unverified: no tick anywhere, the reason in words; refuted: a failed mark and the words", async () => {
  await withFakeDocument(() => {
    const { root } = draw(fakeTaskOutcomes().rowsNotSure);
    assert.equal(root.byClass("answer-mark").length, 0);
    assert.equal(root.textContent.includes("✓"), false);
    assert.equal(root.byClass("answer-check")[0]!.getAttribute("data-state"), "unverified");
    assert.match(text(root, "answer-check-words")[0]!, /please look to be sure/u);
    const refuted = draw(fakeTaskOutcomes().rowsRefuted).root;
    assert.equal(refuted.byClass("answer-mark")[0]!.textContent, "✕");
    assert.equal(refuted.textContent.includes("✓"), false);
    assert.equal(refuted.byClass("answer-check")[0]!.getAttribute("data-state"), "refuted");
    assert.ok(text(refuted, "answer-line").includes("What failed: They are not sorted cheapest first"));
  });
});

test("done on the site lists each act from the record; a plain answer is labelled as the model's", async () => {
  await withFakeDocument(() => {
    const done = draw(fakeTaskOutcomes().doneOnSite).root;
    assert.equal(done.byClass("answer-site-list")[0]!.children.length, 2);
    assert.match(done.byClass("answer-site-list")[0]!.children[1]!.textContent, /may have happened, look to be sure/u);
    assert.match(done.byClass("answer-site-list")[0]!.children[0]!.textContent, /To undo it: Remove it from the cart/u);
    assert.equal(done.byClass("answer-table").length, 0);
    const plain = draw(fakeTaskOutcomes().plainAnswerChecked).root;
    assert.deepEqual(text(plain, "answer-text-label"), ["In the model's words"]);
    assert.deepEqual(text(plain, "answer-text-body"), ["The store is open until nine tonight."]);
  });
});

test("the second attempt is told against the first", async () => {
  await withFakeDocument(() => {
    const { root } = draw(fakeTaskOutcomes().secondAttemptFromSaved);
    assert.ok(text(root, "answer-line").includes("This time 18s and $0.00. First time 3m 14s and $1.12."));
  });
});

test("a port without real spend says nothing about cost", async () => {
  await withFakeDocument(() => {
    const results = createFakeChatResultsPort({ reportsSpend: false });
    const { root } = draw(fakeTaskOutcomes().secondAttemptFromSaved, { results });
    assert.equal(root.textContent.includes("$"), false);
    assert.ok(text(root, "answer-line").includes("This time 18s. First time 3m 14s."));
    const budget = draw(fakeTaskOutcomes().budgetOutPartial, { results }).root;
    assert.equal(budget.textContent.includes("$"), false);
    assert.equal(button(budget, "add-budget").textContent, "Add budget and carry on");
  });
});

test("CSV and JSON call the port and say what came of it, plainly, on failure too", async () => {
  await withFakeDocument(async () => {
    const outcome = fakeTaskOutcomes().rowsChecked;
    const results = createFakeChatResultsPort({ outcomes: [outcome] });
    const { root } = draw(outcome, { results });
    button(root, "export-csv").dispatch("click");
    assert.equal(button(root, "export-csv").disabled, true, "busy while it asks");
    await settle();
    assert.deepEqual(results.calls.map((call) => call.method), ["exportRows"]);
    assert.deepEqual(results.calls[0]!.query, { projectId: "project-1", runId: "run-deals-1", datasetId: "deals", format: "csv" });
    assert.deepEqual(text(root, "answer-status"), ["Saved deals.csv."]);
    assert.equal(button(root, "export-csv").disabled, false);
    results.failNext("exportRows", { ok: false, sentence: "The file could not be saved." });
    button(root, "export-json").dispatch("click");
    await settle();
    assert.deepEqual(text(root, "answer-status"), ["I could not make the JSON file. The file could not be saved."]);
    assert.equal(root.byClass("answer-status")[0]!.getAttribute("role"), "alert");
    assert.equal(results.downloads.length, 1);
  });
});

test("Run again asks the port for this task and says it started", async () => {
  await withFakeDocument(async () => {
    const outcome = fakeTaskOutcomes().rowsChecked;
    const results = createFakeChatResultsPort({ outcomes: [outcome] });
    let changed = 0;
    const { root } = draw(outcome, { results, onChanged: () => { changed += 1; } });
    button(root, "run-again").dispatch("click");
    await settle();
    assert.deepEqual(results.calls[0]!.query, { projectId: "project-1", taskId: "task-deals" });
    assert.deepEqual(text(root, "answer-status"), ["Started again."]);
    assert.equal(changed, 1);
    results.failNext("runAgain", { ok: false, sentence: "Not paired." });
    button(root, "run-again").dispatch("click");
    await settle();
    assert.deepEqual(text(root, "answer-status"), ["I could not start it again. Not paired."]);
    assert.equal(changed, 1);
  });
});

test("What I did is the host's callback, with the attempt, and is absent without one", async () => {
  await withFakeDocument(() => {
    const asked: string[] = [];
    const { root } = draw(fakeTaskOutcomes().rowsChecked, { results: createFakeChatResultsPort(), onWhatIDid: (attemptId) => asked.push(attemptId) });
    button(root, "what-i-did").dispatch("click");
    assert.deepEqual(asked, ["attempt-deals-1"]);
    assert.equal(hasButton(draw(fakeTaskOutcomes().rowsChecked, { results: createFakeChatResultsPort() }).root, "what-i-did"), false);
  });
});

test("budget out: the sentence, what I got (not confirmed), what I saved, and one action that adds the same budget", async () => {
  await withFakeDocument(async () => {
    const outcome = fakeTaskOutcomes().budgetOutPartial;
    const results = createFakeChatResultsPort({ outcomes: [outcome] });
    let changed = 0;
    const { root } = draw(outcome, { results, onChanged: () => { changed += 1; } });
    assert.equal(root.getAttribute("data-kind"), "budget_out");
    assert.deepEqual(text(root, "answer-headline"), ["I reached this task's budget."]);
    assert.deepEqual(text(root, "answer-lead"), ["It spent $5.00 of $5.00.", "What I got: 3 rows."]);
    assert.equal(root.byClass("answer-mark").length, 0);
    assert.equal(root.byClass("answer-row").length, 3);
    assert.equal(button(root, "add-budget").textContent, "Add $5.00 and carry on");
    assert.equal(root.textContent.includes("Run failed"), false);
    button(root, "add-budget").dispatch("click");
    await settle();
    assert.deepEqual(results.calls[0]!.query, { projectId: "project-1", attemptId: "attempt-listings-1", addUsd: 5 });
    assert.deepEqual(text(root, "answer-status"), ["Budget added. Carrying on."]);
    assert.equal(changed, 1);
  });
});

test("budget out with a failed request says why; a port without the method has no button", async () => {
  await withFakeDocument(async () => {
    const outcome = fakeTaskOutcomes().budgetOutPartial;
    const results = createFakeChatResultsPort({ outcomes: [outcome] });
    const { root } = draw(outcome, { results });
    results.failNext("addBudgetAndCarryOn", { ok: false, sentence: "Your balance is empty." });
    button(root, "add-budget").dispatch("click");
    await settle();
    assert.deepEqual(text(root, "answer-status"), ["I could not add the budget. Your balance is empty."]);
    const { addBudgetAndCarryOn: _omitted, ...without } = results;
    assert.equal(hasButton(draw(outcome, { results: without }).root, "add-budget"), false);
  });
});

test("waiting: permission and a person-only check say what they wait for and offer no actions of their own", async () => {
  await withFakeDocument(() => {
    const permission = draw(fakeTaskOutcomes().waitingForPermission, { results: createFakeChatResultsPort() }).root;
    assert.equal(permission.getAttribute("data-kind"), "waiting");
    assert.deepEqual(text(permission, "answer-headline"), ["Waiting for your permission"]);
    for (const action of ["keep-going", "tell-more", "stop", "run-again"]) assert.equal(hasButton(permission, action), false, action);
    const check = draw(fakeTaskOutcomes().waitingForPerson).root;
    assert.deepEqual(text(check, "answer-headline"), ["Waiting for you"]);
    assert.match(text(check, "answer-lead")[0]!, /Continue/u);
  });
});

test("stuck in a loop offers Keep going, Tell it more and Stop as the host's callbacks", async () => {
  await withFakeDocument(() => {
    const heard: string[] = [];
    const host: AnswerHost = {
      results: createFakeChatResultsPort(),
      onKeepGoing: (id) => heard.push(`keep:${id}`),
      onTellMore: (id) => heard.push(`more:${id}`),
      onStop: (id) => heard.push(`stop:${id}`)
    };
    const { root } = draw(fakeTaskOutcomes().stuckInALoop, host);
    assert.deepEqual(text(root, "answer-headline"), ["I keep getting stuck on this"]);
    assert.deepEqual(buttons(root).map((candidate) => candidate.textContent), ["Keep going", "Tell it more", "Stop"]);
    for (const action of ["keep-going", "tell-more", "stop"]) button(root, action).dispatch("click");
    assert.deepEqual(heard, ["keep:attempt-pages-1", "more:attempt-pages-1", "stop:attempt-pages-1"]);
    assert.equal(root.byClass("answer-row").length, 0);
    assert.ok(text(root, "answer-line").includes("Missing: Everything past the first page"));
    assert.equal(buttons(draw(fakeTaskOutcomes().stuckInALoop, { results: createFakeChatResultsPort() }).root).length, 0, "no host callbacks, no buttons");
  });
});

test("Keep going on an attempt its Core cut off carries it on with no budget added, and on one stuck in a loop is still the host's", async () => {
  await withFakeDocument(async () => {
    const heard: string[] = [];
    const results = createFakeChatResultsPort({ outcomes: [fakeTaskOutcomes().interruptedByRestart] });
    const { root } = draw(fakeTaskOutcomes().interruptedByRestart, { results, onKeepGoing: (id) => heard.push(`keep:${id}`), onChanged: () => heard.push("changed") });
    button(root, "keep-going").dispatch("click");
    await settle();
    await settle();
    const asked = results.calls.filter((call) => call.method === "addBudgetAndCarryOn");
    assert.equal(asked.length, 1);
    assert.deepEqual(asked[0]!.query, { projectId: fakeTaskOutcomes().interruptedByRestart.attempt.projectId, attemptId: fakeTaskOutcomes().interruptedByRestart.attempt.attemptId, addUsd: 0 });
    assert.deepEqual(heard, ["changed"], "it was not sent to the model");
    assert.deepEqual(text(root, "answer-status"), ["Carrying on."]);

    const loop = createFakeChatResultsPort({ outcomes: [fakeTaskOutcomes().stuckInALoop] });
    const stuck = draw(fakeTaskOutcomes().stuckInALoop, { results: loop, onKeepGoing: (id) => heard.push(`keep:${id}`) }).root;
    button(stuck, "keep-going").dispatch("click");
    await settle();
    assert.equal(loop.calls.some((call) => call.method === "addBudgetAndCarryOn"), false);
    assert.deepEqual(heard, ["changed", "keep:attempt-pages-1"]);

    // A client that cannot carry on keeps the old press for an interrupted attempt too.
    const { addBudgetAndCarryOn: _carryOn, ...without } = createFakeChatResultsPort({ outcomes: [fakeTaskOutcomes().interruptedByRestart] });
    const plain = draw(fakeTaskOutcomes().interruptedByRestart, { results: without, onKeepGoing: (id) => heard.push(`keep:${id}`) }).root;
    button(plain, "keep-going").dispatch("click");
    assert.equal(heard.at(-1), `keep:${fakeTaskOutcomes().interruptedByRestart.attempt.attemptId}`);
  });
});

test("a carry-on Core refuses says Core's sentence under the card", async () => {
  await withFakeDocument(async () => {
    const results = createFakeChatResultsPort({ outcomes: [fakeTaskOutcomes().interruptedByRestart] });
    results.failNext("addBudgetAndCarryOn", { ok: false, sentence: "That attempt is still going.", code: "failed" });
    const { root } = draw(fakeTaskOutcomes().interruptedByRestart, { results, onKeepGoing: () => undefined });
    button(root, "keep-going").dispatch("click");
    await settle();
    assert.deepEqual(text(root, "answer-status"), ["I could not carry it on. That attempt is still going."]);
  });
});

test("stopped by the person is a quiet turn; working is no turn", async () => {
  await withFakeDocument(() => {
    const { root } = draw(fakeTaskOutcomes().stoppedByPerson, { results: createFakeChatResultsPort() });
    assert.deepEqual(text(root, "answer-headline"), ["Stopped"]);
    assert.deepEqual(text(root, "answer-lead"), ["It had not found anything yet."]);
    assert.equal(root.byClass("answer-check").length, 0);
    assert.equal(createAnswerView().update(fakeTaskOutcomes().working), false);
  });
});

test("no results port: the answer still shows, with no export or Run again", async () => {
  await withFakeDocument(() => {
    const { root } = draw(fakeTaskOutcomes().rowsChecked);
    assert.equal(buttons(root).length, 0);
    assert.equal(root.byClass("answer-row").length, 5);
  });
});
