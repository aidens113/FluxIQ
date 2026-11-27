// t1087: rows that share a label are cited apart. Live run `run-mwz2jc4w-0c207128`'s judge requests 0038 (attempt 1) and 0087
// (attempt 2) held ten stored rows, two of them with one title; the judge qualified the title with "(ends ...)" and matched no row.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultSummaryWithRowHandles } from "../../request-rows/index.ts";
import { automationStudioResultYesCitations } from "../yes-citations.ts";

type Cited = { row: string; column: string; value: string };
type StoredSet = { datasetId: string; columns: string[]; recordCount: number; truncated: boolean; sampleRows: Array<Record<string, string>> };
const here = dirname(fileURLToPath(import.meta.url));
const stored = JSON.parse(readFileSync(join(here, "fixtures", "run-mwz2jc4w-stored-rows.json"), "utf8")) as Record<string, StoredSet[]>;
const replies = JSON.parse(readFileSync(join(here, "..", "..", "..", "models", "providers", "anthropic", "tests", "fixtures", "run-mwz2jc4w-judge-replies.json"), "utf8")) as Record<string, { diagnosis: { checked: Cited[] } }>;
const summary = (step: string) => ({ reads: [], recordSets: stored[step]!.map((set) => ({ ...set, sampleRows: set.sampleRows.map((row) => ({ ...row })), refusedCount: 0, columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [] })) }) as unknown as AutomationStudioRunResultSummary;
const TITLE = "Kestrel 35 Rangefinder Camera";

describe("a yes citing rows that share a label", () => {
  it("is refused today for the title the judge qualified: 1 citation in attempt 1's check, 2 in attempt 2's", () => {
    expect(automationStudioResultYesCitations(summary("0038"), replies["0038"]!.diagnosis.checked)?.refuted).toHaveLength(1);
    expect(automationStudioResultYesCitations(summary("0087"), replies["0087"]!.diagnosis.checked)?.refuted).toHaveLength(2);
  });

  it("says, in Core's sentence, the handles to cite the shared rows by", () => {
    const [sentence] = automationStudioResultYesCitations(summary("0038"), replies["0038"]!.diagnosis.checked)!.refuted;
    expect(sentence).toContain("is no row the result holds");
    expect(sentence).toContain(`"${TITLE} #1", "${TITLE} #2"`);
    expect(sentence).not.toContain("Voss-Anastigmat");
  });

  it("matches each, by its handle, to the right row", () => {
    const byHandle = (step: string) => replies[step]!.diagnosis.checked.map((cited) => {
      if (!cited.row.startsWith(TITLE)) return cited;
      return { ...cited, row: `${TITLE} #${cited.value === "£64.00" ? 1 : 2}` };
    });
    expect(automationStudioResultYesCitations(summary("0038"), byHandle("0038"))?.refuted).toEqual([]);
    expect(automationStudioResultYesCitations(summary("0087"), byHandle("0087"))?.refuted).toEqual([]);
  });

  it("holds a handle to its own row: the second's price is not the first's", () => {
    const wrong = automationStudioResultYesCitations(summary("0087"), [{ row: `${TITLE} #2`, column: "price", value: "£64.00" }])!.refuted;
    expect(wrong).toHaveLength(1);
    expect(wrong[0]).toContain("does not hold the value cited");
    expect(automationStudioResultYesCitations(summary("0087"), [{ row: `${TITLE} #1`, column: "price", value: "£64.00" }])!.refuted).toEqual([]);
  });

  it("still takes the label as written, and a position, as before", () => {
    expect(automationStudioResultYesCitations(summary("0087"), [{ row: TITLE, column: "price", value: "£41.00" }])!.refuted).toEqual([]);
    expect(automationStudioResultYesCitations(summary("0087"), [{ row: "3", column: "price", value: "£41.00" }])!.refuted).toEqual([]);
  });

  it("names no handle for a citation that starts with no shared label", () => {
    const [sentence] = automationStudioResultYesCitations(summary("0087"), [{ row: "Some other title", column: "price", value: "£1.00" }])!.refuted;
    expect(sentence).toBe("The cited row \"Some other title\" is no row the result holds.");
  });
});

describe("the judge's copy of the stored rows", () => {
  it("gives each row that shares a label its handle, and no other row one, without changing the summary given", () => {
    const given = summary("0087");
    const copy = automationStudioResultSummaryWithRowHandles(given);
    const handles = copy.recordSets[0]!.sampleRows!.map((row) => (row as Record<string, unknown>).rowHandle);
    expect(handles).toEqual([`${TITLE} #1`, undefined, `${TITLE} #2`, undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(given.recordSets[0]!.sampleRows![0]).not.toHaveProperty("rowHandle");
  });

  it("is the same summary where no label is shared", () => {
    const given = summary("0087");
    given.recordSets[0]!.sampleRows = given.recordSets[0]!.sampleRows!.filter((row) => row.price !== "£41.00");
    expect(automationStudioResultSummaryWithRowHandles(given)).toBe(given);
  });
});
