import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultYesCitations } from "../index.ts";

// A generic stored answer on another kind of site: a recipe box.
function summary(overrides: Record<string, unknown> = {}): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 2,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "d1", recordCount: 2, refusedCount: 0, missingRequiredColumns: [], truncated: false, columns: ["name", "minutes", "vegan"],
      sampleRows: [{ name: "Lentil Soup", minutes: 40, vegan: true }, { name: "Cheese Tart", minutes: 55, vegan: false }],
      ...overrides
    }],
    flowShape: [{ nodeId: "n1", definitionId: "extract" }],
    withheld: false
  } as unknown as AutomationStudioRunResultSummary;
}

describe("automationStudioResultYesCitations", () => {
  it("says nothing of a yes that cited nothing", () => {
    expect(automationStudioResultYesCitations(summary(), undefined)).toBeUndefined();
    expect(automationStudioResultYesCitations(summary(), [])).toBeUndefined();
  });

  it("finds a cited cell by label, column and value, compared without case, spacing or a closing stop, and numbers as written", () => {
    const found = automationStudioResultYesCitations(summary(), [
      { row: "lentil  soup", column: "Minutes", value: "40" },
      { row: "Cheese Tart", column: "vegan", value: "False." }
    ]);
    expect(found).toEqual({ cited: 2, refuted: [] });
  });

  it("refutes a row, a column and a value Core does not hold, each in its own sentence", () => {
    const found = automationStudioResultYesCitations(summary(), [
      { row: "Fish Pie", column: "minutes", value: "40" },
      { row: "Lentil Soup", column: "calories", value: "300" },
      { row: "Lentil Soup", column: "minutes", value: "45" }
    ]);
    expect(found?.cited).toBe(3);
    expect(found?.refuted).toHaveLength(3);
    expect(found?.refuted[0]).toContain("is no row the result holds");
    expect(found?.refuted[1]).toContain("stores no column");
    expect(found?.refuted[2]).toContain("does not hold the value cited");
    // Core's sentences never carry the stored cell.
    expect(found?.refuted[2]).not.toContain("\"40\"");
  });

  it("does not refute a row it was not shown when it holds only some of the answer", () => {
    const partial = summary({ recordCount: 30 });
    expect(automationStudioResultYesCitations(partial, [{ row: "Fish Pie", column: "minutes", value: "40" }])?.refuted).toEqual([]);
    // A row it does hold is still checked.
    expect(automationStudioResultYesCitations(partial, [{ row: "Lentil Soup", column: "minutes", value: "41" }])?.refuted).toHaveLength(1);
  });

  it("does not refute anything of an answer it holds no row of", () => {
    expect(automationStudioResultYesCitations(summary({ sampleRows: [] }), [{ row: "Fish Pie", column: "minutes", value: "40" }])?.refuted).toEqual([]);
  });
});
