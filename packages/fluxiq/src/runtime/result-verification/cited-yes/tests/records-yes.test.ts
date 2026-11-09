// A yes stands on the rows the result holds (t875). The fixture is a choir's music
// library, a kind of site no realistic scenario uses.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultHeldRowCount, automationStudioResultRecordsYesRefuted } from "../records-yes.ts";

const held = (count: number): Pick<AutomationStudioRunResultSummary, "reads" | "recordSets"> => ({
  recordSets: count ? [{ datasetId: "result", recordCount: count, refusedCount: 0, truncated: false, columns: ["title"], columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: Array.from({ length: count }, (_, at) => ({ title: `Anthem ${at + 1}` })) }] : []
} as unknown as Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">);
const cited = [{ row: "Anthem 1", column: "title", value: "Anthem 1" }];

describe("a yes on the rows held", () => {
  it("stands where it cites a row and counts what the site shows as the rows held", () => {
    expect(automationStudioResultRecordsYesRefuted(held(3), { checked: cited, answerRecords: { asked: true, siteShows: 3 } })).toEqual([]);
  });

  it("is refused, the count leading to the list, where the site shows more records than the rows held", () => {
    const said = automationStudioResultRecordsYesRefuted(held(3), { checked: cited, answerRecords: { asked: true, siteShows: 5 } });
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("counts 5 records the site shows as the answer, but the result holds 3 rows");
    expect(said[0]).toContain("The answer is the list the request names");
  });

  it("is refused where the result holds rows and it cites none", () => {
    expect(automationStudioResultRecordsYesRefuted(held(2), { answerRecords: { asked: true, siteShows: 2 } })).toEqual(["The yes cites no stored row, though the result holds 2 rows: a yes on rows cites in checked each stored row that answers the request."]);
    expect(automationStudioResultRecordsYesRefuted(held(2), { checked: [], answerRecords: { asked: false } })).toHaveLength(1);
  });

  it("is refused where the result holds rows and it says nothing of the records asked", () => {
    expect(automationStudioResultRecordsYesRefuted(held(1), { checked: cited })[0]).toContain("does not say in answerRecords whether the request asks for records");
  });

  it("is refused where records are asked and it gives no count", () => {
    expect(automationStudioResultRecordsYesRefuted(held(1), { checked: cited, answerRecords: { asked: true } })[0]).toContain("not how many the site shows");
  });

  it("stands on an honest empty result: records asked, the site shows none, no rows held", () => {
    expect(automationStudioResultRecordsYesRefuted(held(0), { answerRecords: { asked: true, siteShows: 0 } })).toEqual([]);
  });

  it("is refused where no rows are held and the site shows some", () => {
    expect(automationStudioResultRecordsYesRefuted(held(0), { answerRecords: { asked: true, siteShows: 2 } })[0]).toContain("counts 2 records the site shows as the answer, but the result holds 0 rows");
  });

  it("refuses a yes over no rows that says nothing of records, leading to where they are shown (lane C)", () => {
    const said = automationStudioResultRecordsYesRefuted(held(0), {});
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("The result holds no rows, and the yes does not say in answerRecords");
    expect(said[0]).toContain("find where the site now shows them");
  });

  it("refuses a yes over no rows that cites rows: they are no rows of the result", () => {
    expect(automationStudioResultRecordsYesRefuted(held(0), { checked: cited, answerRecords: { asked: true, siteShows: 0 } })[0]).toContain("The yes cites 1 row, but the result holds none.");
  });

  it("takes a yes over no rows for an act, where no list of records is asked and nothing is cited", () => {
    expect(automationStudioResultRecordsYesRefuted(held(0), { checked: [], answerRecords: { asked: false } })).toEqual([]);
  });

  it("refuses a yes whose own words say it could not judge, however its rows stand", () => {
    expect(automationStudioResultRecordsYesRefuted(held(1), { checked: cited, answerRecords: { asked: true, siteShows: 1 } }, "Whether more are shown cannot be determined.")).toEqual([expect.stringContaining("could not be judged from what is here")]);
  });

  it("needs only a citation where the request asks for no list of records", () => {
    expect(automationStudioResultRecordsYesRefuted(held(4), { checked: cited, answerRecords: { asked: false } })).toEqual([]);
  });

  it("counts the answer's rows, never a working set's", () => {
    // The first read's rows were walked and the list read again by the second: they are working rows (`../../read-account/working-sets.ts`).
    const answer = { ...held(2).recordSets[0]!, processing: { passes: [{ node: "read-again" }] } };
    const working = { ...held(4).recordSets[0]!, datasetId: "work", processing: { passes: [{ node: "read-first" }] } };
    const summary = { recordSets: [working, answer], reads: [{ nodeId: "read-first", workingRows: { rereadBy: "read-again" } }, { nodeId: "read-again" }] } as unknown as Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">;
    expect(automationStudioResultHeldRowCount(held(2))).toBe(2);
    expect(automationStudioResultHeldRowCount(summary)).toBe(2);
  });
});
