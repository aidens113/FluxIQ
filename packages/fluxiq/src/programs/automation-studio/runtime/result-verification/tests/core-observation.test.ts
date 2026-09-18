import { describe, expect, it } from "vitest";
import { automationStudioResultCoreObservation } from "../core-observation.ts";
import type { AutomationStudioRunResultSummary } from "../contracts.ts";

// The two failures Core catches without a model, and the mutation each one is
// proof against.
//
// Both were measured live against DeepSeek on 2026-09-17. A catalogue scrape
// returned none of its eight records and the run reported `passed`; a short
// catalogue found all five of its rows, had every one of them refused by record
// validation, and the run reported `passed` with the extraction step reported
// `succeeded`. Nothing failed, so nothing was reported.

const summary = (fields: Partial<AutomationStudioRunResultSummary> = {}): AutomationStudioRunResultSummary => ({
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 8,
  totalRefusedCount: 0,
  recordSetCount: 1,
  recordSets: [],
  flowShape: [],
  withheld: false,
  ...fields
});

describe("automationStudioResultCoreObservation", () => {
  it("refuses a run that stored no records at all", () => {
    // Mutation: report success when the record count is zero. Returning
    // `undefined` here -- Core has nothing to say -- makes this fail.
    const observation = automationStudioResultCoreObservation(summary({ totalRecordCount: 0 }));
    expect(observation?.verdict).toBe("does_not_answer");
    expect(observation?.code).toBe("core.result.no_records");
    expect(observation?.basis).toBe("core_observation");
    expect(observation?.failure?.category).toBe("output_not_observed");
    expect(observation?.observation).toContain("0 records stored");
  });

  it("refuses a run whose every row was refused, and says so distinctly", () => {
    // Mutation: ignore validation refusals when every row was refused. Dropping
    // the `totalRefusedCount` branch answers `no_records` and this fails.
    const observation = automationStudioResultCoreObservation(summary({ totalRecordCount: 0, totalRefusedCount: 5 }));
    expect(observation?.verdict).toBe("does_not_answer");
    expect(observation?.code).toBe("core.result.every_record_refused");
    expect(observation?.observation).toContain("5 rows were refused");
    expect(observation?.failure?.stage).toBe("verification");
  });

  it("has nothing to say about a run that stored records, so the question goes to the model", () => {
    expect(automationStudioResultCoreObservation(summary({ totalRecordCount: 10 }))).toBeUndefined();
  });

  it("has nothing to say about a run that stored no record set at all", () => {
    expect(automationStudioResultCoreObservation(summary({ recordSetCount: 0, totalRecordCount: 0 }))).toBeUndefined();
  });

  it("bounds the observation it writes into a failure record", () => {
    const observation = automationStudioResultCoreObservation(summary({ totalRecordCount: 0 }));
    expect((observation?.failure?.actual ?? "").length).toBeLessThanOrEqual(1_024);
  });
});
