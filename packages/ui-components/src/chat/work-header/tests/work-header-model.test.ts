// What the work header says: its state, the one line of what happens now, the
// cost segment and its near-limit words, and the one button for a question
// held in another thread.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ActivityDisplay } from "fluxiq/ui";
import { costWords } from "../cost-words.ts";
import { formatElapsed } from "../format-elapsed.ts";
import { workHeaderModel } from "../work-header-model.ts";

const display = (fields: Partial<ActivityDisplay> = {}): ActivityDisplay => ({ activityId: "build:b1", subjectKind: "build", phase: "exploring", headline: "Working on your task",
  detail: "Opening the results page", step: null, working: true, outcome: null, sequence: 3, ...fields });

test("working: the state, then only the current step in one line, with the run's step position before it", () => {
  const model = workHeaderModel({ display: display(), sending: false })!;
  assert.deepEqual([model.state, model.label, model.now, model.action], ["working", "Working", "Opening the results page", ""]);
  const run = workHeaderModel({ display: display({ subjectKind: "run", step: { index: 2, count: 5 } }), sending: false })!;
  assert.equal(run.now, "Step 2 of 5 · Opening the results page");
  assert.equal(workHeaderModel({ display: display({ detail: null }), sending: false })!.now, "Working on your task", "the headline stands in when Core said no detail");
});

test("elapsed time reads 12s, 1m 12s and 1h 05m, never negative", () => {
  assert.equal(formatElapsed(12_900), "12s");
  assert.equal(formatElapsed(72_000), "1m 12s");
  assert.equal(formatElapsed(65 * 60_000 + 59_000), "1h 05m");
  assert.equal(formatElapsed(-5), "0s");
  assert.equal(formatElapsed(Number.NaN), "0s");
});

test("the cost segment appears only with both numbers, and says so in words near the limit, calmly", () => {
  assert.deepEqual(costWords(0.34, 5), { text: "$0.34 of $5.00", limit: "" });
  assert.deepEqual(costWords(undefined, 5), { text: "", limit: "" });
  assert.deepEqual(costWords(0.34, undefined), { text: "", limit: "" });
  assert.deepEqual(costWords(1, 0), { text: "", limit: "" }, "no purse, no segment");
  assert.equal(costWords(3.99, 5).limit, "", "79.8% is not near");
  assert.equal(costWords(4, 5).limit, "Close to the limit");
  assert.equal(costWords(5, 5).limit, "At the limit");
  const near = workHeaderModel({ display: display(), sending: false, meter: { usd: 4.2, budgetUsd: 5 } })!;
  assert.deepEqual([near.cost, near.limit], ["$4.20 of $5.00", "Close to the limit"]);
  assert.equal(workHeaderModel({ display: display(), sending: false, meter: { startedAtMs: 1 } })!.cost, "");
});

test("waiting says what it waits for once, not the ask's sentence, and keeps the one button only when the question is elsewhere", () => {
  const waiting = display({ working: false, outcome: "waiting", phase: "waiting_permission", headline: "Waiting for you: finish the check on the page", detail: "FluxIQ needs you: complete the check on this page, then press Continue." });
  const here = workHeaderModel({ display: waiting, sending: false })!;
  assert.deepEqual([here.state, here.label, here.now, here.action], ["waiting", "Waiting for you", "Finish the check on the page", ""]);
  assert.equal(workHeaderModel({ display: waiting, sending: false, questionElsewhere: true })!.action, "Show the question");
  const held = workHeaderModel({ display: display({ working: false, outcome: "waiting", phase: "paused", headline: "Paused: your turn on the page", detail: null }), sending: false })!;
  assert.deepEqual([held.label, held.now], ["Paused", "Your turn on the page"]);
});

test("between a send and the first activity it says the message is on its way; with nothing at all it is hidden, and Stop alone still shows it", () => {
  const sending = workHeaderModel({ display: null, sending: true, meter: { usd: 1, budgetUsd: 5 } })!;
  assert.deepEqual([sending.state, sending.label, sending.cost], ["sending", "Sending your message", ""]);
  assert.equal(workHeaderModel({ display: null, sending: false }), null);
  assert.equal(workHeaderModel({ display: display({ working: false, outcome: "done" }), sending: false }), null, "settled work has no header");
  assert.equal(workHeaderModel({ display: null, sending: false, stopOffered: true })!.label, "Working");
});
