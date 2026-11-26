// A yes stands only on rows that are the table the request names (t1032). The 0094 shape of run-mwv5m906-5e999159: a
// request for a table with three named columns, a result holding a read of another list with other columns, and a judge
// yes with no defects that says no records are asked. Fixture: a library's loans and its catalogue, made up.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultRecordsYesRefuted } from "../records-yes.ts";

const ASKED = ["title", "copies", "due date"];
const held = (columns: string[], rows: Record<string, string>[]): Pick<AutomationStudioRunResultSummary, "reads" | "recordSets"> => ({
  recordSets: [{ datasetId: "result", recordCount: rows.length, refusedCount: 0, truncated: false, columns, columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: rows }]
} as unknown as Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">);
const CATALOGUE = held(["name", "shelf", "due date"], [{ name: "Tide Tables", shelf: "B2", "due date": "Friday" }, { name: "River Atlas", shelf: "C1", "due date": "Monday" }]);
const LOANS = held(["title", "copies", "due_date"], [{ title: "Tide Tables", copies: "1", due_date: "Friday" }, { title: "Star Charts", copies: "1", due_date: "Monday" }]);

describe("a yes over the table the request names", () => {
  it("is refused over another list's rows, the yes saying no records are asked (the 0094 shape)", () => {
    const said = automationStudioResultRecordsYesRefuted(CATALOGUE, { checked: [{ row: "Tide Tables", column: "due date", value: "Friday" }], answerRecords: { asked: false } }, undefined, ASKED);
    expect(said).toEqual([
      "The request names the columns of the table it asks for (title, copies, due date), so it asks for records, and the yes says it does not. A yes on rows says answerRecords asked true and counts the records of that table the site shows.",
      "The request names the columns title, copies, due date, and the rows the result holds have no title or copies column, so they are not the table it asks for, whatever else they show. The answer is that table, read where the site shows it: where the result holds other rows, answer no, naming the table asked for in defects."
    ]);
  });

  it("is refused over rows that lack a named column though the yes counts them as the records asked", () => {
    const said = automationStudioResultRecordsYesRefuted(CATALOGUE, { checked: [{ row: "Tide Tables", column: "due date", value: "Friday" }], answerRecords: { asked: true, siteShows: 2 } }, undefined, ASKED);
    expect(said).toEqual([expect.stringContaining("have no title or copies column, so they are not the table it asks for")]);
  });

  it("stands on the asked table's own rows, its columns named with other case or separators", () => {
    expect(automationStudioResultRecordsYesRefuted(LOANS, { checked: [{ row: "Tide Tables", column: "copies", value: "1" }], answerRecords: { asked: true, siteShows: 2 } }, undefined, ASKED)).toEqual([]);
  });

  it("refutes a yes whose rows lack an asked column that only shares a word with a held one (t1051)", () => {
    const titles = held(["title", "due"], [{ title: "Tide Tables", due: "Friday" }]);
    const said = automationStudioResultRecordsYesRefuted(titles, { checked: [{ row: "Tide Tables", column: "due", value: "Friday" }], answerRecords: { asked: true, siteShows: 1 } }, undefined, ["title", "due date"]);
    expect(said).toEqual([expect.stringContaining("have no due date column")]);
  });

  it("stands on a held column written in the singular or plural of the asked name (t1051)", () => {
    const plural = held(["titles", "copy"], [{ titles: "Tide Tables", copy: "1" }]);
    expect(automationStudioResultRecordsYesRefuted(plural, { checked: [{ row: "Tide Tables", column: "copy", value: "1" }], answerRecords: { asked: true, siteShows: 1 } }, undefined, ["title", "copies"])).toEqual([]);
    expect(automationStudioResultRecordsYesRefuted(plural, { checked: [{ row: "Tide Tables", column: "copy", value: "1" }], answerRecords: { asked: true, siteShows: 1 } }, undefined, ["title", "copy"])).toEqual([]);
  });

  it("asks nothing of the columns where no table is named, as before", () => {
    expect(automationStudioResultRecordsYesRefuted(CATALOGUE, { checked: [{ row: "Tide Tables", column: "due date", value: "Friday" }], answerRecords: { asked: false } })).toEqual([]);
  });
});
