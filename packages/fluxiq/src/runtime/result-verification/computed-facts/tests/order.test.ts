// The order fact: Core's own reading of the stored rows against the sort the
// Flow declared, or the request's newest or oldest first. A lending library.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultComputedFactsInput, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import type { AutomationStudioResultRecordSetSummary } from "../../record-set-summary.ts";
import { automationStudioResultOrderFact } from "../order.ts";

function set(rows: Array<Record<string, string>>, extra: Partial<AutomationStudioResultRecordSetSummary> = {}): AutomationStudioResultRecordSetSummary {
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

function input(recordSets: AutomationStudioResultRecordSetSummary[], requestText: string): AutomationStudioResultComputedFactsInput {
  const summary = { recordSets } as unknown as AutomationStudioRunResultSummary;
  return { summary, instructions: [{ title: "Goal", body: requestText }], requestText };
}

const DOWN = [{ title: "The Salt Road", loaned: "2026-09-20" }, { title: "Field Notes", loaned: "2026-09-12" }, { title: "Tidal Maps", loaned: "2026-09-03" }];
const READ = (inOrder: boolean) => ({ sortRead: [{ field: "loaned", inOrder, said: "Core sorts this answer by loaned." }] });

describe("the order fact", () => {
  it("holds when Core's reading says the stored rows are in the declared sort", () => {
    const [fact] = automationStudioResultOrderFact(input([set(DOWN, READ(true))], "List the titles loaned this month, newest first."));
    expect(fact).toMatchObject({ kind: "order", status: "holds" });
    expect(fact?.defects).toBeUndefined();
  });

  it("fails, with a defect in the request's own words, when the declared sort is not what the rows are in", () => {
    const [fact] = automationStudioResultOrderFact(input([set([DOWN[1]!, DOWN[0]!, DOWN[2]!], READ(false))], "List the titles loaned this month, newest first."));
    expect(fact).toMatchObject({ kind: "order", status: "fails" });
    expect(fact?.defects).toEqual([{ kind: "other", row: "loans: rows are not in loaned order", column: "loaned", requestWords: "newest first" }]);
  });

  it("holds without a sort when the request asks for newest first and every kept row's dates run that way", () => {
    const [fact] = automationStudioResultOrderFact(input([set(DOWN)], "List the titles loaned this month, newest first."));
    expect(fact).toMatchObject({ kind: "order", status: "holds" });
  });

  it("is no fact, and never a failure, for dates that run the other way without a sort", () => {
    expect(automationStudioResultOrderFact(input([set([...DOWN].reverse())], "List the titles, newest first."))).toEqual([]);
  });

  it("is no fact where rows were cut, the request names no order, or no date can be read", () => {
    const cut = set(DOWN, { processing: { collected: 8, duplicates: 0, filteredOut: 0, cut: 5, kept: 3, passes: [] } });
    expect(automationStudioResultOrderFact(input([cut], "List the titles, newest first."))).toEqual([]);
    expect(automationStudioResultOrderFact(input([set(DOWN)], "List the titles loaned this month."))).toEqual([]);
    expect(automationStudioResultOrderFact(input([set([{ title: "A", loaned: "ask" }, { title: "B", loaned: "ask" }])], "Titles, newest first."))).toEqual([]);
  });
});
