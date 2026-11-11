// Round 12, lane D (`run-mv62icw0-070f88ad`, screenshot 00009): a step Core
// announced and then passed over, because what it acts on was not shown, read
// "Click · close ... if it shows — Done" while the status line said "Skipped
// ...: it was not shown". Its card says it was skipped, and why, and Core's skip
// row is no second card for the same step.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { activityEvent } from "../../../tests/activity-fixture.ts";
import { cardWords } from "../card-words.ts";
import { stepMessages } from "../messages.ts";

const run = (sequence: number, fields: Partial<ClientGatewayActivity>) => activityEvent(sequence, { activityId: "run:r1", subject: { kind: "run", id: "r1", projectId: "p" }, ...fields });
const started = (sequence: number, nodeId: string, index: number, title: string) => run(sequence, {
  phase: "running",
  label: `Running step ${index} of 4: ${title}`,
  step: { index, count: 4, nodeId, label: title },
  detail: { kind: "step", title, status: "started", ref: nodeId, text: "Node: web.click" }
});
const skippedRow = (sequence: number, nodeId: string, reason: "optional_absent" | "state_routed" | "already_done" | "already_in_state", said: string) => run(sequence, {
  phase: "running",
  label: said,
  detail: { kind: "step", title: said, status: "succeeded", ref: nodeId, skipped: { reason, subject: "Close the panel" } }
});
const outcomes = (events: ClientGatewayActivity[]) => stepMessages(events, 100).flatMap((message) => message.actions.map((card) => cardWords(card, false).outcome));

test("a step passed over because it was not shown says it was skipped and why, on its one card", () => {
  const events = [
    started(1, "n2.close", 2, "Close the panel"),
    skippedRow(2, "n2.close", "optional_absent", "Skipped “Close the panel”: it was not shown"),
    started(3, "n3.search", 3, "Search")
  ];
  const shown = outcomes(events);
  // The skipped step's card, then the next step's; no card for the skip row itself.
  assert.equal(shown.length, 2);
  assert.equal(shown[0], "Skipped: not there, optional");
  assert.ok(!shown.includes("Done"));
});

test("a step state routing passed over says the page was already at another step", () => {
  const shown = outcomes([started(1, "n2.close", 2, "Close the panel"), skippedRow(2, "n2.close", "state_routed", "Skipped “Close the panel”: the page is already past it. Continuing with “Search”")]);
  assert.deepEqual(shown, ["Skipped: the page was already at another step"]);
});

test("a skip row for another step, or for an act already done, does not settle the step before it as skipped", () => {
  const other = outcomes([started(1, "n2.close", 2, "Close the panel"), skippedRow(2, "n9.other", "optional_absent", "Skipped “Other”: it was not shown")]);
  assert.equal(other[0], "Done");
  // An act found already done once its step was announced (Core's answer-first run gate) is that
  // step's one card, already done: it read "Done" (`run-mwbadi79-d928f922`, attempt 2).
  const already = outcomes([started(1, "n2.close", 2, "Close the panel"), skippedRow(2, "n2.close", "already_done", "Already done: Close the panel")]);
  assert.deepEqual(already, ["Already done — not pressed again"]);
});

test("a step whose control already showed the asked state says it was not pressed, on its one card, and not as a failure", () => {
  const events = [
    started(1, "n2.close", 2, "Close the panel"),
    skippedRow(2, "n2.close", "already_in_state", "Not pressed: Close the panel already showed the asked state"),
    started(3, "n3.search", 3, "Search")
  ];
  const shown = outcomes(events);
  assert.equal(shown.length, 2);
  assert.equal(shown[0], "Not pressed: it already showed the asked state");
});
