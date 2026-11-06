// What a refusal over the same evidence counts and says, and what it shows of the result: the check
// alone, with no loop around it.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS, AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE, automationStudioAnswerFirstCompletionCheck, automationStudioAnswerFirstResultHolds } from "../index.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const columns = [{ id: "title", label: "Title" }];

function made(rows: () => JsonObject[]) {
  let judged = 0;
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: "List the books on loan",
    rows: async () => ({ datasetId: "dataset.1", totalRows: rows().length, truncated: false, columns, rows: rows() }),
    acts: () => [],
    readsRan: () => true,
    endView: async () => undefined,
    witnesses: () => ({}),
    judge: async () => {
      judged += 1;
      return { verdict: "no", reason: "Not what was asked.", checkedWhat: "the list" };
    },
    purse,
    say: () => undefined
  });
  return { check, judged: () => judged };
}

describe("the same evidence refused again", () => {
  it("counts each one, without a judge, and says what the last no was about and what would change it", async () => {
    const { check, judged } = made(() => [{ title: "Atlas" }, { title: "Birds" }]);
    await check.check({ summary: "Got it." });
    expect(check.state.refusedAgain).toBe(0);
    const again = await check.check({ summary: "Got it, in other words.", notes: { worked: "A note." } });
    expect(check.state.refusedAgain).toBe(1);
    await check.check({ summary: "Got it, in other words again." });
    expect(check.state.refusedAgain).toBe(2);
    expect(judged()).toBe(1);
    if (again.ok) throw new Error("It should have been refused.");
    expect(again.issueCodes).toEqual([AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE]);
    expect(again.feedback.instruction).toContain("Not what was asked.");
    expect(again.feedback.instruction).toContain("Only new evidence changes");
  });

  it("the same rows read in another order are new evidence, and judged again", async () => {
    let shown = [{ title: "Atlas" }, { title: "Birds" }];
    const { check, judged } = made(() => shown);
    await check.check({ summary: "Got it." });
    await check.check({ summary: "Got it." });
    expect(check.state.refusedAgain).toBe(1);
    shown = [{ title: "Birds" }, { title: "Atlas" }];
    await check.check({ summary: "Got it." });
    expect(judged()).toBe(2);
    expect(check.state.refusedAgain).toBe(0);
  });

  it("says what a check that reads no draft reads, and leaves a not-judged free to ask again", () => {
    expect(AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS.sentAgain).toContain("never the draft");
    expect(AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS.sentAgainUnjudged).toContain("not a no");
  });
});

describe("what the result holds, as the model is shown it", () => {
  const holds = (rows: JsonObject[], denied: string[] = [], over: object = {}) => automationStudioAnswerFirstResultHolds({ rows: { totalRows: rows.length, truncated: false, columns: [{ id: "title", label: "Title" }, { id: "token", label: "Token" }], rows, ...over }, acts: 2 }, denied);

  it("keeps the rows' order and counts, by what the check reads", () => {
    expect(holds([{ title: "Birds", handle: "h1" }, { title: "Atlas", handle: "h2" }])).toEqual({ totalRows: 2, columns: ["title", "token"], rowsInOrder: [{ title: "Birds" }, { title: "Atlas" }], acts: 2 });
  });

  it("holds no column or value that may not be sent", () => {
    const shown = holds([{ title: "Atlas", token: "kept out" }, { title: "sk-abcdefghij0123456789abcd", token: "kept out" }], ["token"]);
    expect(shown.columns).toEqual(["title"]);
    expect(JSON.stringify(shown)).not.toContain("kept out");
    expect(JSON.stringify(shown)).not.toContain("sk-abcdefghij");
    expect(JSON.stringify(shown)).toContain("[withheld]");
  });

  it("is bounded, and says when a long list is cut", () => {
    const long = Array.from({ length: 100 }, (_, index) => ({ title: `${index} ${"x".repeat(500)}` }));
    const shown = holds(long);
    expect(shown.rowsInOrder).toHaveLength(30);
    expect(shown.moreRowsNotShownHere).toBe(70);
    expect(JSON.stringify(shown).length).toBeLessThan(8_000);
  });

  it("says plainly when it holds nothing", () => {
    expect(holds([])).toEqual({ totalRows: 0, acts: 2 });
  });
});
