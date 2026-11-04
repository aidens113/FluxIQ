import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { fakeSubflowCards } from "../../../testing/library/index.ts";
import {
  dayWords, failureWords, handedBackLines, historyWords, joinWords, lastingWords, refusalWords, runOutcomeWords, siteHost, trustWords,
  type SubflowRefusalCode, type SubflowRunOutcome
} from "../index.ts";

const NOW = new Date(2026, 10, 4, 12).getTime();
const cards = fakeSubflowCards(NOW);
const [order, basket, colour, loans] = [cards[0]!, cards[1]!, cards[2]!, cards[3]!];

describe("where a subflow stands", () => {
  test("says each tier in plain words", () => {
    assert.equal(trustWords(loans), "Not proven yet");
    assert.equal(trustWords(basket), "Worked once");
    assert.equal(trustWords(order), "Works reliably");
  });

  test("tells a failure since with its day, in words, and nothing when there is none", () => {
    assert.equal(failureWords(basket, NOW), "Last failed 1 Nov");
    assert.equal(failureWords(order, NOW), undefined);
    assert.equal(dayWords(NOW - 3_600_000, NOW), "today");
    assert.equal(dayWords(new Date(2026, 10, 3, 23).getTime(), NOW), "yesterday");
    assert.equal(dayWords(new Date(2025, 11, 30).getTime(), NOW), "30 Dec 2025");
  });

  test("tells how it has gone without machine words", () => {
    assert.deepEqual(historyWords(basket, NOW), ["Worked once when it was checked.", "Failed once. Last failed 1 Nov."]);
    assert.deepEqual(historyWords(order, NOW), ["Worked 2 times when it was checked.", "Ran 5 times on its own since it last failed."]);
    assert.deepEqual(historyWords(loans, NOW), []);
  });
});

describe("what it can do and where", () => {
  test("says each lasting class in words", () => {
    assert.deepEqual(
      (["move_money", "delete", "send_or_publish", "modify_existing", "create_new"] as const).map(lastingWords),
      ["can spend money", "can delete things", "can send or publish", "can change existing things", "can create new things"]
    );
  });

  test("shows sites as host names, and joins words plainly", () => {
    assert.equal(siteHost("https://www.shop.example"), "shop.example");
    assert.equal(siteHost("not a site"), "not a site");
    assert.equal(joinWords(["a", "b", "c"]), "a, b and c");
    assert.equal(colour.fixedValues[0], "Sea green");
  });
});

describe("why a run was refused", () => {
  const codes: SubflowRefusalCode[] = [
    "part.wrong_site", "part.not_at_start", "part.input_missing", "part.input_unknown", "part.act_not_allowed", "part.confirm_repeat",
    "part.calls_not_available", "part.repeat_refused", "parts.unavailable", "part.not_found", "parts.run_id_refused"
  ];

  test("every code is told in words with a next step, and says nothing changed, with no code, id or hash", () => {
    for (const code of codes) {
      const told = refusalWords({ code, classes: ["move_money"] }, order);
      const all = `${told.says} ${told.next}`;
      assert.ok(told.says.endsWith("Nothing on the site changed."), code);
      assert.ok(told.next.length > 5, code);
      assert.ok(!/part\.|parts\.|_|hash|digest|version|restock-notebooks/iu.test(all), `${code}: ${all}`);
    }
  });

  test("asks only for a permission or a repeat, and names what is asked", () => {
    assert.deepEqual(refusalWords({ code: "part.act_not_allowed", classes: ["move_money", "create_new"] }, order).ask, "allow");
    assert.equal(refusalWords({ code: "part.act_not_allowed", classes: ["move_money", "create_new"] }, order).says, "It would spend money and create new things, which needs your permission first. Nothing on the site changed.");
    assert.equal(refusalWords({ code: "part.confirm_repeat" }, order).ask, "repeat");
    assert.equal(refusalWords({ code: "part.wrong_site" }, order).ask, undefined);
  });

  test("says what the start needs where the subflow says it, and which site it works on", () => {
    assert.equal(refusalWords({ code: "part.not_at_start" }, order).next, "It needs: You are signed in and on your order history page. Go there and try again.");
    assert.equal(refusalWords({ code: "part.not_at_start" }, loans).next, "Go to the page it starts from and try again.");
    assert.equal(refusalWords({ code: "part.wrong_site" }, order).next, "Open paperworks.example in this browser and try again.");
  });
});

describe("how a run went", () => {
  const ran = (extra: Partial<SubflowRunOutcome>): SubflowRunOutcome => ({ refused: false, status: "succeeded", outputs: {}, rowCount: 0, acts: [], ...extra });

  test("a run finished or stopped, never failed and never ticked", () => {
    assert.equal(runOutcomeWords(ran({})), "It finished.");
    assert.equal(runOutcomeWords(ran({ rowCount: 1 })), "It finished and saved 1 row.");
    assert.equal(runOutcomeWords(ran({ rowCount: 12 })), "It finished and saved 12 rows.");
    assert.equal(runOutcomeWords(ran({ status: "stopped", stoppedAt: { stepLabel: "Apply filter", reason: "The list never loaded." } })), "It stopped at Apply filter: The list never loaded.");
    assert.equal(runOutcomeWords(ran({ status: "failed" })), "It stopped before it finished.");
    assert.equal(runOutcomeWords(ran({ status: "cancelled" })), "It was cancelled before it finished.");
  });

  test("hands back by the outputs' names", () => {
    assert.deepEqual(handedBackLines(ran({ outputs: { order: "A-1", unknown: [1, 2], flag: true } }), order), ["Order number: A-1", "Result: 2 items", "Result: yes"]);
  });
});
