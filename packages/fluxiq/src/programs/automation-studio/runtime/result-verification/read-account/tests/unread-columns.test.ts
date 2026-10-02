// The judge's summary names the columns the instruction asks for that no stored
// column reads, by the build's matcher and sentence (F35), and nothing else.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts.ts";
import { automationStudioResultSummaryWithUnreadColumns } from "../unread-columns.ts";

function summary(columns: string[], columnsWithheld = false): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 8, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{ datasetId: "earbuds", recordCount: 8, refusedCount: 0, truncated: false, columns, columnsWithheld, rowsChecked: 8, rowsMissingRequired: 0, missingRequiredColumns: [] }],
    flowShape: [], withheld: false
  };
}

const asked = [{ title: "Goal", body: "List the earbuds with columns name, Unit price and rating." }];

describe("the instruction's named columns no stored column reads", () => {
  it("says which, matching names to column ids as the build does", () => {
    expect(automationStudioResultSummaryWithUnreadColumns(summary(["name", "unit_price"]), asked).instructionColumnsUnread)
      .toBe("The instruction asks for a column \"rating\" that no field reads.");
  });

  it("leaves the summary as it was when every named column is stored, none is named, nothing is stored, or the columns were cut", () => {
    const cases: Array<[AutomationStudioRunResultSummary, typeof asked]> = [
      [summary(["name", "unit_price", "rating", "url"]), asked],
      [summary(["name"]), [{ title: "Goal", body: "List the earbuds under $50." }]],
      [summary([]), asked],
      [summary(["name"], true), asked]
    ];
    for (const [given, instructions] of cases) expect(automationStudioResultSummaryWithUnreadColumns(given, instructions)).toBe(given);
  });
});
