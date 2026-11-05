import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS as LIMITS,
  parseAutomationStudioTaskResult,
  type AutomationStudioAttemptAct,
  type AutomationStudioTaskResultRows
} from "@fluxiq/contracts/automation";
import type { JsonValue } from "../../../../core/index.ts";
import { AutomationStudioAnswerFirstEndingError } from "../ending-error.ts";
import { automationStudioAnswerFirstResult } from "../result.ts";

const LANDED: AutomationStudioAttemptAct = { id: "act.1", what: "Booked the hall", where: "the bookings page", classes: ["create_new"], state: "landed" };
const NOT_DONE: AutomationStudioAttemptAct = { ...LANDED, id: "act.2", state: "not_done" };
const rows = (extra: Partial<AutomationStudioTaskResultRows> = {}): AutomationStudioTaskResultRows => ({
  runId: "run.1", datasetId: "bookings", totalRows: 2, truncated: false, columns: [{ id: "date", label: "Date" }], previewRows: [{ date: "6 May" }, { date: "13 May" }], ...extra
});
const confirmed = { attemptId: "attempt.1", label: "confirmed", timesChecked: 1, acts: [] } as const;
const unverified = { attemptId: "attempt.1", label: "unverified", timesChecked: 0, acts: [] } as const;

describe("which kind a result is", () => {
  it("is rows first, keeping its acts", () => {
    expect(automationStudioAnswerFirstResult({ ...confirmed, rows: rows(), acts: [LANDED], answerText: "Two." })).toMatchObject({ kind: "rows", acts: [LANDED], answerText: { text: "Two.", author: "model" }, rows: { runId: "run.1", datasetId: "bookings" } });
  });

  it("is done_on_site with an act that happened, and no rows", () => {
    expect(automationStudioAnswerFirstResult({ ...confirmed, acts: [LANDED], answerText: "Done." }).kind).toBe("done_on_site");
    expect(automationStudioAnswerFirstResult({ ...confirmed, acts: [{ ...LANDED, state: "may_have_landed" }] }).kind).toBe("done_on_site");
  });

  it("is plain_answer with only words, or with an act that never happened", () => {
    expect(automationStudioAnswerFirstResult({ ...confirmed, answerText: "It closes at six." })).toMatchObject({ kind: "plain_answer", answerText: { text: "It closes at six.", author: "model" } });
    expect(automationStudioAnswerFirstResult({ ...confirmed, acts: [NOT_DONE], answerText: "It closes at six." }).kind).toBe("plain_answer");
  });

  it("is an empty partial with nothing, and says so", () => {
    expect(automationStudioAnswerFirstResult({ ...confirmed })).toMatchObject({ kind: "partial", acts: [], missingWhat: "It ended without a confirmed result." });
  });

  it("is rows for an empty set it was confirmed on: nothing can be the right answer", () => {
    expect(automationStudioAnswerFirstResult({ ...confirmed, rows: rows({ totalRows: 0, previewRows: [] }) }).kind).toBe("rows");
  });

  it("always comes out through the contract's parser, and names exploration as its source", () => {
    const result = automationStudioAnswerFirstResult({ ...confirmed, rows: rows(), acts: [LANDED] });
    expect(parseAutomationStudioTaskResult(result).ok).toBe(true);
    expect(result.source).toBe("exploration");
  });
});

describe("a result nothing confirmed, as a budget-out carries it", () => {
  it.each(["unverified", "refuted"] as const)("claims no act and no answer as its kind when %s", (label) => {
    const result = automationStudioAnswerFirstResult({ attemptId: "attempt.1", label, timesChecked: label === "refuted" ? 1 : 0, acts: [LANDED], answerText: "Done, I think." });
    expect(result).toMatchObject({ kind: "partial", label, acts: [LANDED], answerText: { text: "Done, I think.", author: "model" } });
  });

  it("is rows where it read some, labelled as not confirmed", () => {
    expect(automationStudioAnswerFirstResult({ ...unverified, rows: rows() })).toMatchObject({ kind: "rows", label: "unverified", timesChecked: 0 });
  });

  it("is a partial where the rows hold nothing", () => {
    expect(automationStudioAnswerFirstResult({ ...unverified, rows: rows({ totalRows: 0, previewRows: [] }) }).kind).toBe("partial");
  });

  it("is an empty partial where it found nothing, and keeps what the caller says is missing", () => {
    expect(automationStudioAnswerFirstResult({ ...unverified, missingWhat: "The dates were never read." })).toMatchObject({ kind: "partial", label: "unverified", acts: [], missingWhat: "The dates were never read." });
  });
});

describe("a label", () => {
  it.each(["confirmed", "refuted"] as const)("%s with no check is written unverified", (label) => {
    expect(automationStudioAnswerFirstResult({ attemptId: "attempt.1", label, timesChecked: 0, acts: [] }).label).toBe("unverified");
  });

  it("says how often it was checked", () => {
    expect(automationStudioAnswerFirstResult({ ...confirmed, timesChecked: 2 }).timesChecked).toBe(2);
  });
});

describe("the rows on a result", () => {
  it("are dropped, and said so, with no stored dataset to name", () => {
    for (const reference of [{ runId: "" }, { datasetId: "../up" }, { datasetId: "" }]) {
      const result = automationStudioAnswerFirstResult({ ...unverified, rows: rows(reference) });
      expect(result.rows).toBeUndefined();
      expect(result.kind).toBe("partial");
      expect(result.missingWhat).toContain("could not be attached");
    }
  });

  it("show at most the preview's row bound, while the count stays whole", () => {
    const many = Array.from({ length: LIMITS.previewMaxRows + 25 }, (_, index) => ({ date: `day ${index}` }));
    const result = automationStudioAnswerFirstResult({ ...confirmed, rows: rows({ totalRows: many.length, previewRows: many }) });
    expect(result.rows?.previewRows).toHaveLength(LIMITS.previewMaxRows);
    expect(result.rows?.totalRows).toBe(many.length);
  });

  it("stop at a cell too large for the preview, and the count stays whole", () => {
    const huge = "x".repeat(LIMITS.previewMaxBytes + 1);
    const result = automationStudioAnswerFirstResult({ ...confirmed, rows: rows({ totalRows: 3, previewRows: [{ date: "6 May" }, { date: huge }, { date: "20 May" }] }) });
    expect(result.rows?.previewRows).toEqual([{ date: "6 May" }]);
    expect(result.rows?.totalRows).toBe(3);
    expect(result.kind).toBe("rows");
    expect(new TextEncoder().encode(JSON.stringify(result.rows?.previewRows)).length).toBeLessThanOrEqual(LIMITS.previewMaxBytes);
  });

  it("stop at a cell nested past the contract's depth", () => {
    let deep: JsonValue = [];
    for (let depth = 0; depth < LIMITS.previewCellMaxDepth + 2; depth += 1) deep = [deep];
    const result = automationStudioAnswerFirstResult({ ...confirmed, rows: rows({ previewRows: [{ date: "6 May" }, { date: deep }] }) });
    expect(result.rows?.previewRows).toEqual([{ date: "6 May" }]);
  });

  it("drop a column id the contract refuses from the preview, and note it by count", () => {
    const result = automationStudioAnswerFirstResult({
      ...confirmed,
      rows: rows({ totalRows: 1, columns: [{ id: "date", label: "Date" }, { id: "has space", label: "Odd" }, { id: "__proto__", label: "Machinery" }], previewRows: [{ date: "6 May", "has space": "seen" }] })
    });
    expect(result.rows?.columns).toEqual([{ id: "date", label: "Date" }]);
    expect(result.rows?.previewRows).toEqual([{ date: "6 May" }]);
    expect(result.missingWhat).toBe("The preview leaves out 2 columns it could not name; the stored rows keep them.");
  });

  it("drop a key no column names: a read's minted fields are not the stored schema", () => {
    const result = automationStudioAnswerFirstResult({ ...confirmed, rows: rows({ totalRows: 1, previewRows: [{ date: "6 May", $handle: "h1" }] }) });
    expect(result.rows?.previewRows).toEqual([{ date: "6 May" }]);
  });

  it("never preview past the total", () => {
    expect(automationStudioAnswerFirstResult({ ...confirmed, rows: rows({ totalRows: 1 }) }).rows?.previewRows).toEqual([{ date: "6 May" }]);
  });

  it("withhold a credential-shaped cell from the preview, and say so", () => {
    const result = automationStudioAnswerFirstResult({ ...confirmed, rows: rows({ totalRows: 1, previewRows: [{ date: "sk-abcdef1234567890abcdef1234" }] }) });
    expect(result.rows?.previewRows).toEqual([{ date: "[withheld]" }]);
    expect(result.missingWhat).toContain("withheld");
  });
});

describe("the words on a result", () => {
  it("drop a credential-shaped answer whole, and say so", () => {
    const result = automationStudioAnswerFirstResult({ ...confirmed, answerText: "The key is sk-abcdef1234567890abcdef1234." });
    expect(result.answerText).toBeUndefined();
    expect(result.kind).toBe("partial");
    expect(result.missingWhat).toContain("credential");
  });

  it("rewrite a locator out of an answer", () => {
    const result = automationStudioAnswerFirstResult({ ...confirmed, answerText: "It says 6pm in div.opening > span#hours[data-x='1']." });
    expect(result.answerText?.text).not.toContain("span#hours");
  });

  it("shorten an answer to the contract's bound", () => {
    const result = automationStudioAnswerFirstResult({ ...confirmed, answerText: "word ".repeat(LIMITS.answerMaxLength) });
    expect(result.answerText?.text.length).toBeLessThanOrEqual(LIMITS.answerMaxLength);
    expect(result.kind).toBe("plain_answer");
  });

  it("leave off a blank answer", () => {
    expect(automationStudioAnswerFirstResult({ ...confirmed, answerText: "   " }).answerText).toBeUndefined();
  });

  it("leave off what the contract refuses as a person's words", () => {
    const result = automationStudioAnswerFirstResult({ ...confirmed, checkedWhat: "See https://example.test/page", missingWhat: "<b>rows</b>", from: [{ site: "https://example.test", pages: "2 pages" }, { site: "example.test", pages: "2 pages" }] });
    expect(result.checkedWhat).toBeUndefined();
    expect(result.missingWhat).toBe("It ended without a confirmed result.");
    expect(result.from).toEqual([{ site: "example.test", pages: "2 pages" }]);
  });

  it("keep what the contract takes", () => {
    expect(automationStudioAnswerFirstResult({ ...confirmed, checkedWhat: "Checked once.", from: [{ site: "example.test", pages: "2 pages" }] })).toMatchObject({ checkedWhat: "Checked once.", from: [{ site: "example.test", pages: "2 pages" }] });
  });
});

describe("the check's words on a result that was not confirmed", () => {
  it("keeps what a no said, whole, as what failed, with the acts that name their items", () => {
    const said = "The order is wrong: the bowls come before the mugs. Asked for: cheapest first. Sort the list by price, lowest first.";
    const named = { ...LANDED, what: "Save: Speckled mug, 300ml" };
    const result = automationStudioAnswerFirstResult({ attemptId: "attempt.1", label: "refuted", timesChecked: 3, acts: [named], rows: rows(), checkedWhat: said, missingWhat: "The budget ran out before this was confirmed." });
    expect(result).toMatchObject({ label: "refuted", checkedWhat: said, missingWhat: "The budget ran out before this was confirmed.", acts: [{ what: "Save: Speckled mug, 300ml" }] });
  });
});

describe("the acts on a result", () => {
  it("keep an act whose words the contract refuses, in plainer words", () => {
    const result = automationStudioAnswerFirstResult({ ...confirmed, acts: [{ ...LANDED, what: "Pressed <button>Book</button>" }] });
    expect(result.acts).toEqual([{ ...LANDED, what: "A change on the site, in words that could not be kept" }]);
    expect(result.kind).toBe("done_on_site");
  });

  it("say an act whose state cannot be read may have landed, never not done", () => {
    const act = { ...LANDED, state: "perhaps" } as unknown as AutomationStudioAttemptAct;
    expect(automationStudioAnswerFirstResult({ ...unverified, acts: [act] }).acts[0]?.state).toBe("may_have_landed");
  });
});

describe("a record it cannot make", () => {
  it("throws the typed error on an attempt id the contract refuses", () => {
    expect(() => automationStudioAnswerFirstResult({ ...unverified, attemptId: "not an id" })).toThrow(AutomationStudioAnswerFirstEndingError);
  });
});

describe("rows the record held as already done", () => {
  it("are on the result as a count, when at least one", () => {
    expect(automationStudioAnswerFirstResult({ ...unverified, skippedAsDone: 2 })).toMatchObject({ skippedAsDone: 2 });
    expect(automationStudioAnswerFirstResult({ ...confirmed, rows: rows(), skippedAsDone: 1 })).toMatchObject({ kind: "rows", skippedAsDone: 1 });
  });

  it("are left off when none, and the count is never zero on a record", () => {
    expect(automationStudioAnswerFirstResult({ ...unverified })).not.toHaveProperty("skippedAsDone");
    expect(automationStudioAnswerFirstResult({ ...unverified, skippedAsDone: 0 })).not.toHaveProperty("skippedAsDone");
    expect(automationStudioAnswerFirstResult({ ...unverified, skippedAsDone: -1 })).not.toHaveProperty("skippedAsDone");
    expect(automationStudioAnswerFirstResult({ ...unverified, skippedAsDone: 1.5 })).not.toHaveProperty("skippedAsDone");
  });

  it("go through the contract's parser with the rest", () => {
    expect(parseAutomationStudioTaskResult(automationStudioAnswerFirstResult({ ...unverified, skippedAsDone: 3 })).ok).toBe(true);
  });
});
