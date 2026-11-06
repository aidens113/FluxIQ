// The "Checked" line says how often the answer was checked as it was: a no then a yes is two checks, never "once" (t869).

import assert from "node:assert/strict";
import { test } from "vitest";
import { fakeTaskOutcomes } from "../../../testing/index.ts";
import { answerModel } from "../model/index.ts";
import { checkedTimesWords } from "../words/index.ts";

const LINE = "5 rows, 3 acts on the site, once against what was asked for.";

test("one check stays once, two are twice, more are counted", () => {
  assert.equal(checkedTimesWords(LINE, 1), LINE);
  assert.equal(checkedTimesWords(LINE, 2), "5 rows, 3 acts on the site, twice against what was asked for.");
  assert.equal(checkedTimesWords(LINE, 4), "5 rows, 3 acts on the site, 4 times against what was asked for.");
  assert.equal(checkedTimesWords("nothing to show, once against what was asked for.", 2), "nothing to show, twice against what was asked for.");
  assert.equal(checkedTimesWords(LINE, 0), "5 rows, 3 acts on the site, against what was asked for.");
});

test("words that are not the count line are left as they are", () => {
  assert.equal(checkedTimesWords("the rows hold the three jobs asked for", 2), "the rows hold the three jobs asked for");
});

test("the answer's checked line does not say once after two checks", () => {
  const outcome = structuredClone(fakeTaskOutcomes().rowsChecked);
  outcome.result!.timesChecked = 2;
  outcome.result!.checkedWhat = LINE;
  const model = answerModel(outcome, { reportsSpend: false, canAddBudget: false })!;
  assert.equal(model.checked, "Checked: 5 rows, 3 acts on the site, twice against what was asked for.");
});
