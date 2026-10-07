// The head of Core's observation of a build's test, which the check's card
// reads its count from (t274-c3; live run `run-muw60j7c-bb7c9a62`, C-3): the
// test stored nothing itself, the head said "0 records stored", and the card
// read "Passed: no rows came back" over a Flow that would store 30 rows.
import { describe, expect, it } from "vitest";
import { automationStudioResultCheckWords } from "../check-words.ts";
import type { AutomationStudioBuildTestStore, AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultObservation } from "../verdict.ts";

/** A dataset whose reads collected one more row than its answer keeps: the count is the answer's. */
const store = (rows: number, steps: number[]): AutomationStudioBuildTestStore => ({
  dataset: "web.output.dom-extract_list", writeMode: "append", steps, passes: steps.length, collected: rows + 1,
  answer: { rows, labels: [] }, removed: { duplicates: 1, filteredOut: 0, cut: 0 }
});

function summary(stores: AutomationStudioBuildTestStore[] | undefined): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 0,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 0,
    recordSets: [],
    flowShape: [],
    withheld: false,
    buildTest: { kind: "build_test", test: "ran", steps: [], ...(stores ? { stores } : {}) }
  };
}

describe("Core's observation of a build's test", () => {
  it("run muw60j7c: leads with the rows the Flow would store, not the test's empty record sets", () => {
    expect(automationStudioResultObservation(summary([store(30, [6, 7])]))).toBe("30 records would be stored, in 1 dataset.");
    expect(automationStudioResultObservation(summary([store(1, [6])]))).toBe("1 record would be stored, in 1 dataset.");
  });

  it("says what was stored when the test does not know what the Flow would store", () => {
    expect(automationStudioResultObservation(summary(undefined))).toBe("0 records stored, across 0 record sets.");
  });

  it("is what the check's card says as rows that would be stored", () => {
    const words = automationStudioResultCheckWords({
      schemaVersion: "automation-studio.result-verification.v1", verdict: "answers", basis: "model", code: "core.result.answers_request",
      reason: "The result was judged to answer the request.", observation: automationStudioResultObservation(summary([store(20, [6]), store(10, [7])]))
    });
    expect(words).toBe("30 rows would be stored. The result was judged to answer the request.");
  });
});
