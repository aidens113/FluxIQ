// Which of a summary's record sets hold working rows (t752, `../working-sets.ts`):
// each set only reads Core flagged as working collected, where the later read
// each flag names stored a set of its own. Shown on a made-up recipe archive
// and on t691's library loans.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultWorkingRows, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { RENEWALS_LIST_READ, renewalsRunSummary } from "../../request-rows/tests/renewals-fixture.ts";
import { automationStudioResultReadWorkingSets } from "../working-sets.ts";

const flag = (rereadBy: string): AutomationStudioResultWorkingRows => ({ rereadBy, repeatedBy: ["s5"], sameList: "items_edge_and_read_target", said: "working rows" });

/** Record sets by dataset id and the reads that collected each, and the reads Core flagged with the later read each names. */
function summary(sets: Record<string, string[]>, flagged: Record<string, string>): AutomationStudioRunResultSummary {
  const nodes = [...new Set([...Object.values(sets).flat(), ...Object.keys(flagged), ...Object.values(flagged)])];
  return {
    schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: Object.keys(sets).length,
    recordSets: Object.entries(sets).map(([datasetId, collectors]) => ({
      datasetId, recordCount: 0, refusedCount: 0, truncated: false, columns: ["title"], columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [],
      ...(collectors.length ? { processing: { collected: 0, duplicates: 0, filteredOut: 0, cut: 0, kept: 0, passes: collectors.map((node, index) => ({ node, pass: index + 1, rows: 0, newRows: 0 })) } } : {})
    })),
    reads: nodes.map((nodeId) => ({ nodeId, definitionId: "extract_list", pagesRead: 1, truncated: false, kept: 0, ...(flagged[nodeId] ? { workingRows: flag(flagged[nodeId]!) } : {}) })),
    flowShape: [], withheld: false
  };
}

const ids = (input: AutomationStudioRunResultSummary) => [...automationStudioResultReadWorkingSets(input)];

describe("which record sets hold working rows", () => {
  it("is each set only a flagged read collected, where the read that re-read its list stored a set of its own", () => {
    expect(ids(summary({ "all-recipes": ["s3"], "quick-recipes": ["s6"] }, { s3: "s6" }))).toEqual(["all-recipes"]);
  });

  it("follows a later read that is flagged itself to the read that stores the answer", () => {
    expect(ids(summary({ "all-recipes": ["s3"], "soups": ["s6"], "quick-soups": ["s9"] }, { s3: "s6", s6: "s9" }))).toEqual(["all-recipes", "soups"]);
  });

  it("is none without Core's flag, for a set another read also collected or that names no collector, or where the re-read stored nothing of its own", () => {
    expect(ids(summary({ "all-recipes": ["s3"], "quick-recipes": ["s6"] }, {}))).toEqual([]);
    expect(ids(summary({ "all-recipes": ["s3", "s6"], "quick-recipes": ["s6"] }, { s3: "s6" }))).toEqual([]);
    expect(ids(summary({ "all-recipes": [], "quick-recipes": ["s6"] }, { s3: "s6" }))).toEqual([]);
    expect(ids(summary({ "all-recipes": ["s3"] }, { s3: "s6" }))).toEqual([]);
    expect(ids(summary({ "all-recipes": ["s3"], "soups": ["s6"] }, { s3: "s6", s6: "s3" }))).toEqual([]);
  });

  it("makes the library's act read working rows where Core flags it, leaving the last read's set the answer (t691)", () => {
    const loans = renewalsRunSummary();
    loans.reads![0]!.workingRows = flag(RENEWALS_LIST_READ);
    expect(ids(loans)).toEqual(["overdue-loans-s8"]);
  });
});
