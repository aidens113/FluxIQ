// What the card says when a task ends with its budget gone, by how the check stood: what was done and which item
// each act was on, what the check said, and what is not confirmed. A made-up site (a pottery market), never a real one.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fakeTaskOutcomes } from "../../../testing/index.ts";
import type { ChatTaskOutcome, ChatTaskResult } from "../../ports/index.ts";
import { answerModel, type AnswerModel } from "../model/index.ts";

const SAVES: ChatTaskResult["acts"] = [
  { id: "a1", what: "Save: Speckled mug, 300ml", where: "On the site", classes: ["modify_existing"], state: "landed" },
  { id: "a2", what: "Save: Glazed fruit bowl", where: "On the site", classes: ["modify_existing"], state: "landed" },
  { id: "a3", what: "Save: Blue milk jug, handmade", where: "On the site", classes: ["modify_existing"], state: "landed" }
];

function ended(result: Partial<ChatTaskResult>, withoutRows = false): AnswerModel {
  const outcome: ChatTaskOutcome = structuredClone(fakeTaskOutcomes().rowsRefuted);
  delete outcome.result!.checkedWhat;
  outcome.result = { ...outcome.result!, acts: SAVES, ...result };
  if (withoutRows) delete outcome.result.rows;
  const model = answerModel(outcome, { reportsSpend: true, canAddBudget: false, nowMs: 1_800_000_000_000 });
  assert.notEqual(model, undefined);
  return model!;
}

test("refuted at the budget: the check's own words say what failed, and each act names its item", () => {
  const model = ended({ label: "refuted", timesChecked: 3, checkedWhat: "The rows come back dearest first. Asked for: cheapest first.", missingWhat: "The budget ran out before this was confirmed." });
  assert.equal(model.kind, "budget_out");
  assert.deepEqual(model.check, { state: "refuted", mark: "cross", words: "Did not pass the check" });
  assert.equal(model.checked, "What failed: The rows come back dearest first. Asked for: cheapest first.");
  assert.equal(model.missing, "Missing: The budget ran out before this was confirmed.");
  assert.equal(model.gotLine, "What I got: 2 rows and 3 things done on the site.");
  assert.deepEqual(model.siteLines, ["Save: Speckled mug, 300ml.", "Save: Glazed fruit bowl.", "Save: Blue milk jug, handmade."]);
});

test("a count of what the check looked at is never told as what failed, or what was meant to be checked", () => {
  for (const label of ["refuted", "unverified"] as const) {
    const model = ended({ label, timesChecked: 2, checkedWhat: "2 rows, 3 acts on the site, once against what was asked for." });
    assert.equal(model.checked, undefined, label);
  }
  assert.equal(ended({ label: "refuted", timesChecked: 2, checkedWhat: "nothing to show, once against what was asked for." }).checked, undefined);
});

test("unverified after a check that could not tell: what it was meant to settle, and to look", () => {
  const model = ended({ label: "unverified", timesChecked: 2, checkedWhat: "whether 2 rows, 3 acts on the site came to what was asked for." });
  assert.equal(model.check?.state, "unverified");
  assert.equal(model.check?.words, "Not confirmed. I could not confirm this, so please look to be sure.");
  assert.equal(model.checked, "Meant to check: whether 2 rows, 3 acts on the site came to what was asked for.");
});

test("no check at all: it says it did not get to check, and no line about a check", () => {
  const model = ended({ label: "unverified", timesChecked: 0 });
  assert.equal(model.check?.words, "Not confirmed. I did not get to check this, so please look to be sure.");
  assert.equal(model.checked, undefined);
});

test("confirmed keeps what was checked", () => {
  const model = ended({ label: "confirmed", timesChecked: 1, checkedWhat: "2 rows, 3 acts on the site, once against what was asked for." });
  assert.deepEqual(model.check, { state: "confirmed", mark: "tick", words: "Checked" });
  assert.equal(model.checked, "Checked: 2 rows, 3 acts on the site, once against what was asked for.");
});

test("what it got says what it did on the site when there are no rows, and when an act may not have happened", () => {
  assert.equal(ended({ label: "unverified", timesChecked: 0 }, true).gotLine, "What I got: 3 things done on the site.");
  const may = ended({ label: "unverified", timesChecked: 0, acts: [SAVES[0]!, { ...SAVES[1]!, state: "may_have_landed" }] }, true);
  assert.equal(may.gotLine, "What I got: 1 thing done on the site and 1 thing that may have happened on the site.");
  assert.equal(ended({ acts: [] }).gotLine, "What I got: 2 rows.");
});
