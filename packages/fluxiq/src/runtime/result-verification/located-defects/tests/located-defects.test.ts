// Each defect a no lists, found or not in Core's own record of the result
// (t752): a kept row or a wrong value needs a stored answer row, a missing row
// a left-out row Core does not account for or a read whose list goes on, and
// every defect the request's own words. The made-up library account of
// `../../tests/loan-fixture.ts`: no task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmVerificationDefect } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording, AutomationStudioRequestRowId } from "../../request-rows/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { DUE_THIS_WEEK, LOANS_DUE, LOANS_LATER, loanInstruction, loanRequestText, loanRunSummary } from "../../agreement/tests/loan-fixture.ts";
import { automationStudioResultDefectsLocated } from "../index.ts";

function located(defects: AutomationStudioLlmVerificationDefect[], summary: AutomationStudioRunResultSummary = loanRunSummary()) {
  const wording = automationStudioRequestWording([loanInstruction()], summary);
  const record = automationStudioResultNoRecord({ summary, requestText: loanRequestText(), wording });
  return automationStudioResultDefectsLocated(defects, { record, summary });
}

const STORED = LOANS_DUE[1]!.title;
const LATER = LOANS_LATER[0]!.title;

describe("a defect a no lists, located in Core's record (t752)", () => {
  it("locates a kept row the result stores, quoting the request, by its label or Core's id", () => {
    expect(located([{ kind: "kept_not_asked", row: STORED, requestWords: "marked due this week" }]).located).toHaveLength(1);
    expect(located([{ kind: "kept_not_asked", row: `[row ${AutomationStudioRequestRowId.of(STORED)}]`, requestWords: "marked due this week" }]).located).toHaveLength(1);
  });

  it("does not locate a kept row the result does not store: a working row is no row of the result", () => {
    const result = located([{ kind: "kept_not_asked", row: LATER, requestWords: "marked due this week" }]);
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("is no row the result holds");
  });

  it("does not locate a defect quoting words the request never says", () => {
    const result = located([{ kind: "kept_not_asked", row: STORED, requestWords: "only hardback editions" }]);
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("\"only hardback editions\" are not words the request says");
  });

  it("locates a wrong value only in a column the result stores", () => {
    expect(located([{ kind: "wrong_value", row: STORED, column: "Due", requestWords: "due date" }]).located).toHaveLength(1);
    const unknown = located([{ kind: "wrong_value", row: STORED, column: "shelf mark", requestWords: "due date" }]);
    expect(unknown.located).toEqual([]);
    expect(unknown.findings.join(" ")).toContain("stores no column");
  });

  it("does not locate a missing row Core settled against the request's own words, nor one the result holds", () => {
    const settled = located([{ kind: "asked_missing", row: LATER, requestWords: "due this week" }]);
    expect(settled.located).toEqual([]);
    expect(settled.findings.join(" ")).toContain("Due next week");
    expect(located([{ kind: "asked_missing", row: STORED, requestWords: "due this week" }]).located).toEqual([]);
  });

  it("locates a missing row a condition alone left out that Core did not settle", () => {
    const unsettled = loanRunSummary({
      answerRead: {
        conditions: [{ number: 1, condition: DUE_THIS_WEEK, rejected: LOANS_LATER.length, alone: LOANS_LATER.length, leftOutOnlyByThis: LOANS_LATER.map((book) => book.title), leftOutCells: LOANS_LATER.map((book) => ({ ...book })) }]
      }
    });
    expect(located([{ kind: "asked_missing", row: LATER, column: "status", value: LOANS_LATER[0]!.status, requestWords: "every book on loan" }], unsettled).located).toHaveLength(1);
    // Its own cells must bear the no out (t771): a value its status cell does not say, or none, is no defect Core finds.
    expect(located([{ kind: "asked_missing", row: LATER, column: "status", value: "Due this week", requestWords: "every book on loan" }], unsettled).located).toEqual([]);
    expect(located([{ kind: "asked_missing", row: LATER, requestWords: "every book on loan" }], unsettled).located).toEqual([]);
  });

  it("locates rows not read only where a read's own account says its list goes on past what it read", () => {
    const notRead: AutomationStudioLlmVerificationDefect = { kind: "asked_missing", row: "rows not read", requestWords: "every book on loan" };
    const ended = located([notRead]);
    expect(ended.located).toEqual([]);
    expect(ended.findings.join(" ")).toContain("every read's own account says its list ended");
    const goesOn = loanRunSummary({ answerRead: { listContinues: { kind: "next_page", evidence: "following_page_number" } } });
    expect(located([notRead], goesOn).located).toHaveLength(1);
    const pagedToBound = loanRunSummary({ answerRead: { paginates: true, pagesRead: 3, pageLimit: 3, stop: "page_limit" } });
    expect(located([notRead], pagedToBound).located).toHaveLength(1);
    const pagedToEnd = loanRunSummary({ answerRead: { paginates: true, pagesRead: 2, pageLimit: 5, stop: "control_disabled" } });
    expect(located([notRead], pagedToEnd).located).toEqual([]);
  });

  it("says a no that lists nothing listed nothing", () => {
    expect(located([])).toEqual({ located: [], findings: [] });
  });
  it("keeps ambiguous column aliases unconfirmed rather than skipping the claimed-value check", () => {
    const summary = loanRunSummary();
    const answer = summary.recordSets.find((set) => set.datasetId === "due") ?? summary.recordSets[summary.recordSets.length - 1]!;
    answer.columns = ["title", "due", "renewalsLeft", "renewalsUsed"];
    answer.sampleRows = (answer.sampleRows ?? []).map((row) => ({ title: row.title!, due: row.due!, renewalsLeft: "1", renewalsUsed: "0" }));
    const result = located([{ kind: "wrong_value", row: STORED, column: "renewals", value: "9", requestWords: "renewals left" }], summary);
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("unambiguously");
  });

});
