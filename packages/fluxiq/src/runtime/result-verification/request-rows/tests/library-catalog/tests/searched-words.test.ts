// The words a request searched by are found where a kept row names a request
// phrase inside a longer one (debug of `run-mvtdoyf3-47ffaac1`, F2): one row of
// that run named "for wireless earbuds", every other "wireless earbuds", so the
// exact phrases had nothing in common and the search's words were taken for the
// request's own. A library catalog: "Hook Rack for Garden Tools" names "for
// garden tools", which the request says too, and so also "garden tools".
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../../../contracts/index.ts";
import { automationStudioRequestWording } from "../../../request-wording.ts";

const REQUEST = "Search the catalog for garden tools and list every result on the first page.";
const KEPT = ["Garden Tools Set, 5 Pieces", "Pocket Guide to Garden Tools", "Hook Rack for Garden Tools"];

function summary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: KEPT.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{
      datasetId: "tools", recordCount: KEPT.length, refusedCount: 0, truncated: false, columns: ["title"], columnsWithheld: false,
      rowsChecked: KEPT.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: KEPT.map((title) => ({ title }))
    }],
    reads: [{ nodeId: "read", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: KEPT.length, kept: KEPT.length, conditions: [] }],
    flowShape: [{ nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

describe("the words a request searched by (F2)", () => {
  const wording = automationStudioRequestWording([{ title: "List the catalog", body: REQUEST }], summary())!;

  it("include a phrase every kept row names, inside a longer phrase or not", () => {
    expect(wording.ownWords("Search the catalog for garden tools")).toEqual(["catalog"]);
    expect(wording.ownWords("garden tools")).toEqual([]);
  });

  it("stay the request's own where a kept row does not name them", () => {
    const other = automationStudioRequestWording([{ title: "List the catalog", body: REQUEST }], {
      ...summary(),
      recordSets: [{ ...summary().recordSets[0]!, sampleRows: [...KEPT, "Seed Tray Kit"].map((title) => ({ title })) }]
    })!;
    expect(other.ownWords("garden tools")).toEqual(["garden", "tool"]);
  });
});
