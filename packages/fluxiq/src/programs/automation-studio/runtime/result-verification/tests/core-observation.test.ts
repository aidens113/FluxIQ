import { describe, expect, it } from "vitest";
import { automationStudioResultCoreObservation } from "../core-observation.ts";
import type { AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../contracts.ts";

// The failures Core catches without a model, and the mutation each one is
// proof against.
//
// The first two were measured live against DeepSeek on 2026-09-17. A catalogue
// scrape returned none of its eight records and the run reported `passed`; a
// short catalogue found all five of its rows, had every one of them refused by
// record validation, and the run reported `passed` with the extraction step
// reported `succeeded`. Nothing failed, so nothing was reported.
//
// The third is rows stored with a field the Flow's own schema declares
// required and no value in it -- the case the 2026-09-18 campaign showed
// validation lets through when the value is an empty string.

const summary = (fields: Partial<AutomationStudioRunResultSummary> = {}): AutomationStudioRunResultSummary => ({
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 8,
  totalRefusedCount: 0,
  totalRowsMissingRequired: 0,
  recordSetCount: 1,
  recordSets: [],
  flowShape: [],
  withheld: false,
  ...fields
});

const recordSet = (fields: Partial<AutomationStudioResultRecordSetSummary> = {}): AutomationStudioResultRecordSetSummary => ({
  datasetId: "homes",
  recordCount: 10,
  refusedCount: 0,
  truncated: false,
  columns: ["address", "price", "listed"],
  columnsWithheld: false,
  rowsChecked: 10,
  rowsMissingRequired: 0,
  missingRequiredColumns: [],
  ...fields
});

describe("automationStudioResultCoreObservation", () => {
  it("has nothing to say about an empty result, because only the request can settle it", () => {
    // It used to refuse one outright. Mutation: refuse a run that stored no rows
    // and refused none -- an empty table is then wrong even where the request
    // says it is the right answer, and the model is never asked.
    expect(automationStudioResultCoreObservation(summary({ totalRecordCount: 0 }))).toBeUndefined();
  });

  it("refuses a run whose every row was refused, and says so distinctly", () => {
    // Mutation: ignore validation refusals when every row was refused. Dropping
    // the `totalRefusedCount` branch answers `undefined` -- the run is then put
    // to a model over a schema mismatch no reading of a request can excuse.
    const observation = automationStudioResultCoreObservation(summary({ totalRecordCount: 0, totalRefusedCount: 5 }));
    expect(observation?.verdict).toBe("does_not_answer");
    expect(observation?.code).toBe("core.result.every_record_refused");
    expect(observation?.observation).toContain("5 rows were refused");
    expect(observation?.failure?.stage).toBe("verification");
  });

  it("has nothing to say about a run that stored records, so the question goes to the model", () => {
    expect(automationStudioResultCoreObservation(summary({ totalRecordCount: 10 }))).toBeUndefined();
  });

  it("refuses a run whose stored rows lack a value the Flow's own schema requires, without asking anyone", () => {
    // Mutation: let a row missing a required value through the free check.
    // Dropping the `totalRowsMissingRequired` branch returns `undefined` -- the
    // question goes to a model, which a created Flow's run does not have -- and
    // every assertion here fails.
    const observation = automationStudioResultCoreObservation(summary({
      totalRecordCount: 10,
      totalRowsMissingRequired: 9,
      recordSets: [recordSet({ rowsMissingRequired: 9, missingRequiredColumns: ["listed"] })]
    }));
    expect(observation?.verdict).toBe("does_not_answer");
    expect(observation?.basis).toBe("core_observation");
    expect(observation?.code).toBe("core.result.required_values_missing");
    expect(observation?.failure?.category).toBe("output_not_observed");
    expect(observation?.observation).toBe("9 of 10 rows checked, of 10 stored, have no value for a required field (listed).");
  });

  it("settles on a single row missing a required value, as the schema itself would", () => {
    const observation = automationStudioResultCoreObservation(summary({
      totalRecordCount: 57,
      totalRowsMissingRequired: 1,
      recordSets: [recordSet({ recordCount: 57, rowsChecked: 57, rowsMissingRequired: 1, missingRequiredColumns: ["price", "address"] })]
    }));
    expect(observation?.code).toBe("core.result.required_values_missing");
    expect(observation?.observation).toContain("1 of 57 rows checked, of 57 stored, has no value");
    expect(observation?.observation).toContain("(price, address)");
  });

  it("does not reach the required-value finding on a run with no rows, since there is no row to lack a value", () => {
    expect(automationStudioResultCoreObservation(summary({ totalRecordCount: 0, totalRowsMissingRequired: 3 }))).toBeUndefined();
  });

  it("has nothing to say about a run that stored no record set at all", () => {
    expect(automationStudioResultCoreObservation(summary({ recordSetCount: 0, totalRecordCount: 0 }))).toBeUndefined();
  });

  it("bounds the observation it writes into a failure record", () => {
    const observation = automationStudioResultCoreObservation(summary({ totalRecordCount: 0, totalRefusedCount: 5 }));
    expect((observation?.failure?.actual ?? "").length).toBeLessThanOrEqual(1_024);
  });
});
