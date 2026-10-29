// A trial whose judge advised a list of today's values, which Core noted, is
// told the mark to test instead (t790, run `run-mvswewhy-e4e469d4`, where the
// builder kept the list). A library's loans, made up: the request defines its
// rows by each row's relation to the person ("books I have on loan"), and the
// read's `renew` column -- a control only a loan of the person's own shows --
// is the mark.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_RESULT_LISTED_VALUES_NOTE } from "../../../../../result-verification/listed-values/index.ts";
import type { AutomationStudioBuildTestVerdict, AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../../../../../result-verification/index.ts";
import { automationStudioCandidateTrialFeedback, automationStudioTrialRowMark } from "../../../index.ts";

/**
 * An advice as Core's agreement leaves it: with the note where its values are
 * ones the request does not say (`result-verification/agreement/exclusion-words.ts`,
 * whose own tests hold when it notes), and unchanged where the request names them.
 */
const noted = (advice: string): string => `${advice} (${AUTOMATION_STUDIO_RESULT_LISTED_VALUES_NOTE})`;

const ADVICE = "Keep only rows whose branch is one of Elm Street Branch, Harbour Branch.";

const loan = (title: string, branch: string, renew: string, due: string): JsonObject => ({ title, branch, renew, due });

function summaryOf(rows: JsonObject[], leftOutCells: Record<string, string>[] = []): AutomationStudioRunResultSummary {
  const set: AutomationStudioResultRecordSetSummary = {
    datasetId: "loans", recordCount: rows.length, refusedCount: 0, truncated: false, columns: ["title", "branch", "renew", "due"], columnsWithheld: false,
    rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: rows,
    processing: { collected: rows.length, duplicates: 0, filteredOut: 0, cut: 0, kept: rows.length, passes: [{ node: "read", pass: 1, rows: rows.length, newRows: rows.length }] }
  };
  const read = { nodeId: "read", definitionId: "web.output.dom-extract_list", pagesRead: 1, truncated: false, kept: rows.length, conditions: [{ number: 1, condition: "title is present", rejected: leftOutCells.length, alone: leftOutCells.length, leftOutCells }] } as AutomationStudioResultReadAccount;
  return { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: rows.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [set], reads: [read], flowShape: [{ nodeId: "read", definitionId: "web.output.dom-extract_list" }], withheld: false };
}

const MARKED = summaryOf([
  loan("A Field Guide to Ferns", "Elm Street Branch", "Renew", "Due 12 Oct 2026"),
  loan("Tide Tables", "Harbour Branch", "Renew", "Due 15 Oct 2026"),
  loan("Night Trains", "Hill Road Branch", "", "Available")
], [{ title: "", branch: "Hill Road Branch", renew: "", due: "Available" }]);

describe("the mark a noted list of values is told to test instead", () => {
  it("names the read's column that marks the rows the listed values pick out, and the condition on it", () => {
    const said = automationStudioTrialRowMark(noted(ADVICE), summaryOf([
      loan("A Field Guide to Ferns", "Elm Street Branch", "Renew", "Due 12 Oct 2026"),
      loan("Tide Tables", "Harbour Branch", "Renew", "Due 15 Oct 2026"),
      loan("Night Trains", "Hill Road Branch", "", "Available")
    ]));
    expect(said).toContain("renew has a value on every one of the rows whose branch is one the advice lists");
    expect(said).toContain("{\"field\":\"renew\",\"is\":\"present\"}");
  });

  it("names a shared start where every listed row's value begins the same way and no other row's does", () => {
    const said = automationStudioTrialRowMark(noted(ADVICE), summaryOf([
      loan("A Field Guide to Ferns", "Elm Street Branch", "", "On loan to you, due 12 Oct 2026"),
      loan("Tide Tables", "Harbour Branch", "", "On loan to you, due 15 Oct 2026"),
      loan("Night Trains", "Hill Road Branch", "", "Available")
    ]));
    expect(said).toContain("due starts with \"On loan to you, due\"");
    expect(said).toContain("\"startsWith\":\"On loan to you, due\"");
  });

  it("says where to look in the structure when no column the read takes marks them", () => {
    const said = automationStudioTrialRowMark(noted(ADVICE), summaryOf([
      loan("A Field Guide to Ferns", "Elm Street Branch", "", "Due 12 Oct 2026"),
      loan("Tide Tables", "Harbour Branch", "", "Due 15 Oct 2026"),
      loan("Night Trains", "Hill Road Branch", "", "Due 20 Oct 2026")
    ]));
    expect(said).toContain("no column this read takes differs between");
    expect(said).toContain("a button, badge or label whose coverage is below 1");
  });

  // A request that names its values gets no note (`agreement/tests/listed-values-advice.test.ts`), so its advice comes unchanged.
  it("is not said where the request names its values, or where the advice lists none", () => {
    expect(automationStudioTrialRowMark(ADVICE, MARKED)).toBeUndefined();
    expect(automationStudioTrialRowMark("Read every page of the list.", MARKED)).toBeUndefined();
    expect(automationStudioTrialRowMark(undefined, MARKED)).toBeUndefined();
  });
});

describe("a judged no's trial feedback", () => {
  const no = (advice: string) => ({ verdict: "no", expected: "e", observed: "o", advice, findings: [], spent: {} }) as unknown as AutomationStudioBuildTestVerdict;

  it("carries rowMark beside the noted advice, and nothing where the request names its values", () => {
    const told = automationStudioCandidateTrialFeedback.judged({ verdict: no(noted(ADVICE)), summary: MARKED, trialRunId: "trial.1", start: "reset" }).feedback;
    expect(told.rowMark).toContain("renew has a value");
    expect((told.judge as JsonObject).advice).toContain("what the page shows today");
    const named = automationStudioCandidateTrialFeedback.judged({ verdict: no(ADVICE), summary: MARKED, trialRunId: "trial.1", start: "reset" }).feedback;
    expect(named.rowMark).toBeUndefined();
  });
});
