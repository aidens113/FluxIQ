// t493, live run `run-mv6bg8d8-1a461436` (C round 14): the saved answer's
// `process.where` left out rows the request asked for, and the model was told
// only how many rows were stored. A judged trial now says, per processing
// condition, the rows it alone left out, so the model sees what its filter
// dropped. The rows here are a stand-in site's, not the run's.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioBuildTestVerdict, AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioCandidateTrialFeedback, automationStudioTrialProcessedOutFeedback } from "../index.ts";

const LEFT_OUT = ["Trail Watch 2, GPS, Heart Rate, Charging Dock, Black", "Trail Watch Lite, GPS, Ivory with Charging Dock"];

const summary = (): AutomationStudioRunResultSummary => ({
  schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, flowShape: [], withheld: false,
  recordSets: [{
    datasetId: "watches", recordCount: 1, refusedCount: 0, truncated: false, columns: ["name"], columnsWithheld: false, rowsChecked: 1, rowsMissingRequired: 0, missingRequiredColumns: [],
    processing: {
      collected: 4, duplicates: 0, filteredOut: 3, cut: 0, kept: 1, passes: [{ node: "s4", pass: 1, rows: 4, newRows: 4 }],
      conditions: [
        { condition: "name not contains \"Spare Strap\"", rejected: 1, alone: 1, leftOutOnlyByThis: ["Spare Strap for Trail Watch"] },
        { condition: "name not contains \"Charging Dock\"", rejected: 2, alone: 2, leftOutOnlyByThis: [...LEFT_OUT], testedLabel: true },
        { rejected: 0, alone: 0 }
      ]
    }
  }]
});

describe("the rows a saved answer's processing alone left out, for the model", () => {
  it("names each processing condition's rows, with its wording and counts, and says how to read them", () => {
    const told = automationStudioTrialProcessedOutFeedback(summary());
    expect(told?.conditions).toEqual([
      // Each by its number and wording, as every line names it (t574).
      { dataset: "watches", condition: "condition 1 (name not contains \"Spare Strap\")", rejected: 1, rejectedByItself: 1, rows: ["Spare Strap for Trail Watch"] },
      { dataset: "watches", condition: "condition 2 (name not contains \"Charging Dock\")", rejected: 2, rejectedByItself: 2, rows: LEFT_OUT }
    ]);
    expect(told?.said).toContain("recordOutput.process.where");
    expect(JSON.stringify(told)).not.toContain("testedLabel");
  });

  it("says nothing for a set whose processing left no row out by one condition alone", () => {
    const plain = summary();
    plain.recordSets[0]!.processing!.conditions = [{ rejected: 0, alone: 0 }];
    expect(automationStudioTrialProcessedOutFeedback(plain)).toBeUndefined();
  });

  it("is in a judged trial's feedback beside what was stored, under every verdict", () => {
    const verdict = { verdict: "yes", spent: {} } as unknown as AutomationStudioBuildTestVerdict;
    const { feedback } = automationStudioCandidateTrialFeedback.judged({ verdict, summary: summary(), trialRunId: "trial.1", start: "reset" });
    const stored = feedback.stored as JsonObject;
    expect(stored).toMatchObject({ rows: 1, refused: 0, missingRequired: 0 });
    expect(JSON.stringify(stored.processedOut)).toContain(LEFT_OUT[1]);
  });
});

// t752: a trial's stored rows sum every record set, a working read's included.
// The feedback also says how many rows the answer set holds: the set the last
// storing step of the run writes, which is what the Flow answers with.
const answerSet = (datasetId: string, recordCount: number, node?: string): AutomationStudioResultRecordSetSummary => ({
  datasetId, recordCount, refusedCount: 0, truncated: false, columns: ["name"], columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [],
  ...(node ? { processing: { collected: recordCount, duplicates: 0, filteredOut: 0, cut: 0, kept: recordCount, passes: [{ node, pass: 1, rows: recordCount, newRows: recordCount }] } } : {})
});
const setsSummary = (recordSets: AutomationStudioResultRecordSetSummary[], order: string[] = []): AutomationStudioRunResultSummary => ({
  schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: recordSets.reduce((sum, each) => sum + each.recordCount, 0), totalRefusedCount: 0, totalRowsMissingRequired: 0,
  recordSetCount: recordSets.length, recordSets, flowShape: order.map((nodeId) => ({ nodeId, definitionId: "read" })), withheld: false
});
const storedOf = (input: AutomationStudioRunResultSummary): JsonObject => {
  const verdict = { verdict: "no", expected: "e", observed: "o", findings: [], spent: {} } as unknown as AutomationStudioBuildTestVerdict;
  return automationStudioCandidateTrialFeedback.judged({ verdict, summary: input, trialRunId: "trial.1", start: "reset" }).feedback.stored as JsonObject;
};

describe("the answer rows a judged trial's feedback states", () => {
  it("are the rows of the set the run's last storing step writes, beside every set's sum", () => {
    // The answer set listed first, the working set after it: the run order decides, not the list's.
    expect(storedOf(setsSummary([answerSet("answer", 3, "s5"), answerSet("working", 27, "s2")], ["s1", "s2", "s3", "s5"]))).toMatchObject({ rows: 30, answerRows: 3 });
  });

  it("are the only set's rows where one set was stored, and the last listed set's where the run order names none", () => {
    expect(storedOf(setsSummary([answerSet("only", 4)]))).toMatchObject({ rows: 4, answerRows: 4 });
    expect(storedOf(setsSummary([answerSet("working", 27), answerSet("answer", 0)]))).toMatchObject({ rows: 27, answerRows: 0 });
  });

  it("are absent where nothing was stored", () => {
    expect(storedOf(setsSummary([]))).not.toHaveProperty("answerRows");
  });
});
