// A processing condition's settled rows are named as a read condition's are
// (`../row-ids.ts`, t841): the judge's copy gives an id only to a
// row a yes must still name, and the verdict reads the rows without any id.
import { describe, expect, it } from "vitest";
import { automationStudioResultSummaryWithRowIds } from "../row-ids.ts";
import { AutomationStudioRequestRowId } from "../../../row/index.ts";
import { CATALOGUE_QUOTED_YES, processingCatalogue, processingVerdict } from "../../../../value-readings/tests/processing-catalogue.ts";

const shown = (summary: ReturnType<typeof processingCatalogue>) => automationStudioResultSummaryWithRowIds(summary).recordSets[0]!.processing!.conditions![0]!.leftOutOnlyByThis;

describe("the judge's copy of a processing condition's left-out rows", () => {
  it("gives no id to a row Core settled", () => {
    expect(shown(processingCatalogue())).toEqual(["The Clockmaker's Almanac", "Songs of the Tides"]);
  });

  it("still gives an id to a row of the same condition Core could not settle", () => {
    const summary = processingCatalogue({ rows: [
      { title: "Kept", shelf: "Available today" },
      { title: "Shared", shelf: "On loan" }, { title: "Shared", shelf: "In transit" },
      { title: "Repeated", shelf: "On loan" }, { title: "Repeated", shelf: "On loan" }
    ] });
    expect(shown(summary)).toEqual([AutomationStudioRequestRowId.said("Shared", "Shared"), "Repeated"]);
  });

  it("gives every row its id on an account with no tested values, and holds a yes to it as before", () => {
    const summary = processingCatalogue({ changeAccount: (account) => {
      delete account.conditions![0]!.evaluation;
      for (const row of account.conditions![0]!.leftOutOnlyByThis) delete row.tested;
    } });
    expect(shown(summary)).toEqual(["The Clockmaker's Almanac", "Songs of the Tides"].map((row) => AutomationStudioRequestRowId.said(row, row)));
    expect(processingVerdict(summary, CATALOGUE_QUOTED_YES)).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
  });
});
