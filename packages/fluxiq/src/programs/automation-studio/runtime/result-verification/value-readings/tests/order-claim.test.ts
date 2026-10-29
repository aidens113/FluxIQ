// A judge's order claim weighed against the rows' own date values (t795; the
// order-claim half of t511). A lending library, made up.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultRecordSetSummary } from "../../contracts/index.ts";
import { automationStudioResultOrderClaimContradicted } from "../order-claim.ts";

const NOW = Date.UTC(2026, 9, 13, 12);

function loans(rows: Array<Record<string, string>>, extra: Partial<AutomationStudioResultRecordSetSummary> = {}): AutomationStudioResultRecordSetSummary {
  return {
    datasetId: "loans",
    recordCount: rows.length,
    refusedCount: 0,
    truncated: false,
    columns: ["title", "loaned"],
    columnsWithheld: false,
    rowsChecked: rows.length,
    rowsMissingRequired: 0,
    missingRequiredColumns: [],
    sampleRows: rows,
    processing: { collected: rows.length, duplicates: 0, filteredOut: 0, cut: 0, kept: rows.length, passes: [] },
    ...extra
  };
}

const NEWEST_FIRST = [
  { title: "The Salt Road", loaned: "2026-09-20" },
  { title: "Field Notes", loaned: "2026-09-12" },
  { title: "Tidal Maps", loaned: "2026-09-03" }
];

describe("an order claim against the kept rows' own dates", () => {
  it("a no calling date-ordered kept rows not newest-first is contradicted by their own date values", () => {
    const sets = [loans(NEWEST_FIRST)];
    expect(automationStudioResultOrderClaimContradicted("The titles are not newest first: Tidal Maps was loaned after Field Notes.", sets, NOW)).toBe(true);
    expect(automationStudioResultOrderClaimContradicted("The rows are out of order by loaned.", sets, NOW)).toBe(true);
  });

  it("reads relative and short dates as the sort does", () => {
    const sets = [loans([{ title: "A", loaned: "1 day ago" }, { title: "B", loaned: "4 days ago" }, { title: "C", loaned: "Sep 24" }])];
    expect(automationStudioResultOrderClaimContradicted("Result is not newest first.", sets, NOW)).toBe(true);
  });

  it("does not read a bare 1d or 1w, which the date reader takes as no date", () => {
    const sets = [loans([{ title: "A", loaned: "1d" }, { title: "B", loaned: "4d" }, { title: "C", loaned: "1w" }])];
    expect(automationStudioResultOrderClaimContradicted("Result is not newest first.", sets, NOW)).toBe(false);
  });

  it("does not contradict a claim of the other way, which the dates do not run", () => {
    expect(automationStudioResultOrderClaimContradicted("Not sorted oldest first.", [loans(NEWEST_FIRST)], NOW)).toBe(false);
  });

  it("does not contradict a no when the dates run the wrong way or both ways", () => {
    const ascending = loans([...NEWEST_FIRST].reverse());
    expect(automationStudioResultOrderClaimContradicted("Rows are not newest first.", [ascending], NOW)).toBe(false);
    const mixed = loans([NEWEST_FIRST[1]!, NEWEST_FIRST[0]!, NEWEST_FIRST[2]!]);
    expect(automationStudioResultOrderClaimContradicted("Rows are not newest first.", [mixed], NOW)).toBe(false);
  });

  it("does not contradict when rows were cut past a limit, whose dates the kept rows cannot vouch for", () => {
    const cut = loans(NEWEST_FIRST, { processing: { collected: 8, duplicates: 0, filteredOut: 0, cut: 5, kept: 3, passes: [] } });
    expect(automationStudioResultOrderClaimContradicted("Rows are not newest first: an older title was kept.", [cut], NOW)).toBe(false);
  });

  it("does not contradict when a kept row states no date or the set is cut short", () => {
    const partly = loans([...NEWEST_FIRST.slice(0, 2), { title: "Tidal Maps", loaned: "ask at desk" }]);
    expect(automationStudioResultOrderClaimContradicted("Rows are not newest first.", [partly], NOW)).toBe(false);
    expect(automationStudioResultOrderClaimContradicted("Rows are not newest first.", [loans(NEWEST_FIRST, { truncated: true })], NOW)).toBe(false);
  });

  it("does not contradict words that deny no order", () => {
    expect(automationStudioResultOrderClaimContradicted("Three titles are listed, newest first.", [loans(NEWEST_FIRST)], NOW)).toBe(false);
  });
});
