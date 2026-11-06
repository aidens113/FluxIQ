// An act an earlier attempt did is not this attempt's: the check line, "What I got" and the site
// title count and say only what this attempt did (t869).

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatAttemptAct, ChatTaskOutcome } from "../../ports/index.ts";
import { fakeTaskOutcomes } from "../../../testing/index.ts";
import { answerModel } from "../model/index.ts";
import { isEarlierAct, siteWords } from "../words/index.ts";

const act = (id: string, what: string): ChatAttemptAct => ({ id, what, where: "", classes: [], state: "landed" });
const EARLIER = [act("a1", "Already done earlier: Saved: Round table"), act("a2", "Already done earlier: Saved: Glass table"), act("a3", "Already done earlier: Saved: Dining table")];

function nothingNew(): ChatTaskOutcome {
  const outcome = structuredClone(fakeTaskOutcomes().rowsChecked);
  outcome.result!.acts = EARLIER;
  return outcome;
}

test("an act carried from an earlier attempt is known by the words the record gave it", () => {
  assert.equal(isEarlierAct(EARLIER[0]!), true);
  assert.equal(isEarlierAct({ ...EARLIER[0]!, what: "May already be done: Saved: A" }), true);
  assert.equal(isEarlierAct(act("a4", "Saved: Round table")), false);
});

test("an attempt that changed nothing says so, beside what already stood", () => {
  const { title, lines } = siteWords(EARLIER);
  assert.equal(title, "On the site: nothing changed this time");
  assert.equal(lines.length, 3);
  assert.equal(siteWords([...EARLIER, act("a4", "Saved: Rattan chair")]).title, "On the site");
});

test("What I got counts this attempt's acts and says the earlier ones apart", () => {
  const outcome = fakeTaskOutcomes().budgetOutPartial;
  const stopped = structuredClone(outcome);
  stopped.result!.acts = [...EARLIER, act("a4", "Saved: Rattan chair")];
  const line = answerModel(stopped, { reportsSpend: false, canAddBudget: false })!.gotLine ?? "";
  assert.match(line, /1 thing done on the site/u);
  assert.match(line, /3 things already done earlier/u);
  stopped.result!.acts = EARLIER;
  assert.match(answerModel(stopped, { reportsSpend: false, canAddBudget: false })!.gotLine ?? "", /3 things already done earlier/u);
  assert.doesNotMatch(answerModel(stopped, { reportsSpend: false, canAddBudget: false })!.gotLine ?? "", /3 things done on the site/u);
});

test("an attempt that did nothing new still tells a person what Run again does", () => {
  const model = answerModel(nothingNew(), { reportsSpend: false, canAddBudget: false })!;
  assert.match(model.runAgainNote ?? "", /checked, not done again/u);
});
