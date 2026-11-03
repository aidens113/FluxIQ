// Each act defect a no lists, found or not in Core's record of the steps the
// run took (t766): a result that stores no rows has no row a no could name, so
// its no names the act -- missing, or done wrong by a step Core holds. On the
// made-up library account of `./act-only-fixture.ts`; the row result of
// `../../agreement/tests/loan-fixture.ts` shows an act defect is never taken
// where the result stores rows.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmVerificationDefect } from "../../../llm/index.ts";
import type { AutomationStudioBuildTestAccount, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { loanInstruction, loanRequestText, loanRunSummary } from "../../agreement/tests/loan-fixture.ts";
import { automationStudioResultDefectsLocated } from "../index.ts";
import { REMINDER_REQUEST, reminderInstruction, reminderRunSummary } from "./act-only-fixture.ts";

function located(defects: AutomationStudioLlmVerificationDefect[], summary: AutomationStudioRunResultSummary = reminderRunSummary()) {
  const wording = automationStudioRequestWording([reminderInstruction()], summary);
  const record = automationStudioResultNoRecord({ summary, requestText: REMINDER_REQUEST, wording });
  return automationStudioResultDefectsLocated(defects, { record, summary });
}

const QUOTE = "have them arrive two days before a book is due";

describe("an act defect a no lists, located in Core's record of the steps the run took (t766)", () => {
  it("locates an act no step did, by what it is done to, where the result stores no rows", () => {
    expect(located([{ kind: "act_missing", row: "Send reminders: two days before", requestWords: QUOTE }])).toEqual({ located: [expect.objectContaining({ kind: "act_missing" })], findings: [] });
  });

  it("does not locate an act a step of the run names: that step did it", () => {
    const result = located([{ kind: "act_missing", row: "Due-date reminders", requestWords: "turn on due-date reminders" }]);
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("is named by step \"switch-reminders\", which this run took");
  });

  it("locates a step that acted, by its node id or its label", () => {
    expect(located([{ kind: "act_wrong", step: "switch-reminders", row: "Due-date reminders", requestWords: QUOTE }]).located).toHaveLength(1);
    expect(located([{ kind: "act_wrong", step: "Turn on reminders", row: "Due-date reminders", requestWords: QUOTE }]).located).toHaveLength(1);
  });

  it("does not locate a step Core holds no record of", () => {
    const result = located([{ kind: "act_wrong", step: "choose-timing", row: "Send reminders", requestWords: QUOTE }]);
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("\"choose-timing\" is no step of this run Core holds");
  });

  it("does not locate an act defect quoting words the request never says", () => {
    const result = located([{ kind: "act_missing", row: "Send reminders: two days before", requestWords: "email me a week ahead" }]);
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("are not words the request says");
  });

  it("locates a build test's step by its number, and never a step that reads rows", () => {
    const tested = reminderRunSummary({
      flowShape: [],
      buildTest: {
        kind: "build_test", test: "ran",
        steps: [
          { step: 1, action: "example.press", target: ["Account settings"], outcome: "replayed" },
          { step: 2, action: "example.read", outcome: "replayed", observed: { readRows: { rows: ["Reminders: on"] } } }
        ]
      } satisfies AutomationStudioBuildTestAccount
    });
    expect(located([{ kind: "act_wrong", step: "1", row: "Account settings", requestWords: QUOTE }], tested).located).toHaveLength(1);
    expect(located([{ kind: "act_wrong", step: "step 1", row: "Account settings", requestWords: QUOTE }], tested).located).toHaveLength(1);
    const read = located([{ kind: "act_wrong", step: "2", row: "Reminders", requestWords: QUOTE }], tested);
    expect(read.located).toEqual([]);
    expect(read.findings.join(" ")).toContain("is a step that reads rows, not one that acts");
  });

  // Supervisor, 2026-10-27: the steps are evidence apart from the rows, so a result that stores rows takes an act defect
  // too, and a row claim beside it still needs its row in the record.
  it("takes an act defect beside stored rows, and a row claim there still needs its row", () => {
    const summary = loanRunSummary();
    const wording = automationStudioRequestWording([loanInstruction()], summary);
    const record = automationStudioResultNoRecord({ summary, requestText: loanRequestText(), wording });
    const result = automationStudioResultDefectsLocated([
      { kind: "act_wrong", step: "details", row: "details", requestWords: "marked due this week" },
      { kind: "kept_not_asked", row: "Notes from the Salt Marsh", requestWords: "marked due this week" }
    ], { record, summary });
    expect(result.located).toEqual([expect.objectContaining({ kind: "act_wrong" })]);
    expect(result.findings).toEqual([expect.stringContaining("is no row the result holds")]);
  });

  // The carried-row shape (t766): a Flow reads a list, then acts on each of its rows.
  it("takes an act defect of a step repeated over a list's rows, never one of the read itself", () => {
    const summary = reminderRunSummary({
      totalRecordCount: 2, recordSetCount: 1,
      recordSets: [{
        datasetId: "loans", recordCount: 2, refusedCount: 0, truncated: false, columns: ["title"], columnsWithheld: false, rowsChecked: 2, rowsMissingRequired: 0, missingRequiredColumns: [],
        sampleRows: [{ title: "Winter at Holloway Mill" }, { title: "Notes from the Salt Marsh" }],
        processing: { collected: 2, duplicates: 0, filteredOut: 0, cut: 0, kept: 2, passes: [{ node: "read-loans", pass: 1, rows: 2, newRows: 2 }] }
      }],
      reads: [{ nodeId: "read-loans", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 2, kept: 2 }],
      flowShape: [
        { nodeId: "read-loans", definitionId: "extract_list" },
        { nodeId: "remind-each", definitionId: "example.press", label: "Turn on reminders", parameters: { control: "Remind me" }, rowsActedOn: [{ title: "Winter at Holloway Mill" }, { title: "Notes from the Salt Marsh" }], perRow: "Ran once per row of read-loans." }
      ]
    });
    const wrong: AutomationStudioLlmVerificationDefect = { kind: "act_wrong", step: "remind-each", row: "Remind me", requestWords: QUOTE };
    expect(located([wrong], summary).located).toHaveLength(1);
    expect(located([{ ...wrong, step: "read-loans" }], summary).findings.join(" ")).toContain("is a step that reads rows");
  });
});
