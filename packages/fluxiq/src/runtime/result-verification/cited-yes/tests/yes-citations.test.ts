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

  describe("a row cited by its position", () => {
    const four = summary({
      recordCount: 4,
      sampleRows: [{ name: "Lentil Soup", minutes: 40 }, { name: "Cheese Tart", minutes: 55 }, { name: "Fish Pie", minutes: 70 }, { name: "Flatbread", minutes: 25 }]
    });

    it("is the Nth stored row, written 1, row 2 or #3, when its cells match", () => {
      const found = automationStudioResultYesCitations(four, [
        { row: "1", column: "minutes", value: "40" },
        { row: "row 2", column: "minutes", value: "55" },
        { row: "#3", column: "minutes", value: "70" },
        { row: "4", column: "name", value: "Flatbread" }
      ]);
      expect(found).toEqual({ cited: 4, refuted: [] });
    });

    it("is refuted where that row's cell does not hold the cited value", () => {
      const found = automationStudioResultYesCitations(four, [{ row: "2", column: "minutes", value: "40" }]);
      expect(found?.refuted).toHaveLength(1);
      expect(found?.refuted[0]).toContain("does not hold the value cited");
    });

    it("is refuted past the last row when the rows are complete, and not when they are only a sample", () => {
      const past = [{ row: "5", column: "minutes", value: "40" }];
      expect(automationStudioResultYesCitations(four, past)?.refuted[0]).toContain("is no row the result holds");
      expect(automationStudioResultYesCitations(summary({ recordCount: 9, sampleRows: [{ name: "Lentil Soup", minutes: 40 }] }), [{ row: "5", column: "minutes", value: "40" }])?.refuted).toEqual([]);
      expect(automationStudioResultYesCitations(four, [{ row: "0", column: "minutes", value: "40" }])?.refuted).toHaveLength(1);
    });

    it("never overrides a label: a row whose label is a number is found by that label", () => {
      const numbered = summary({ recordCount: 2, sampleRows: [{ name: "2", minutes: 10 }, { name: "1", minutes: 20 }] });
      expect(automationStudioResultYesCitations(numbered, [{ row: "1", column: "minutes", value: "20" }])?.refuted).toEqual([]);
      expect(automationStudioResultYesCitations(numbered, [{ row: "1", column: "minutes", value: "10" }])?.refuted).toHaveLength(1);
    });

    it("still finds a row by its label", () => {
      expect(automationStudioResultYesCitations(four, [{ row: "Fish Pie", column: "minutes", value: "70" }])?.refuted).toEqual([]);
    });
  });
});
