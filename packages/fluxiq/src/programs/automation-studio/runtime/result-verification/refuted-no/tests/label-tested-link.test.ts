// A test read on the row's own link is a label test (t659, A8 frozen pair 6
// project towels `run-mvac0nmw-52ed30b2` step 0047, t651's rule): Core measured
// an address whose path is the row's name, never who lends the row, so the
// condition neither accounts for the rows it left out nor refutes a no with
// them, and is not held. A column of its own still is. A library's atlas
// search whose request names the library's own short name as the lender. No
// task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import type { AutomationStudioResultReadCondition } from "../../read-condition.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultConditionTestsLabel, automationStudioResultLinkSpellsLabel, automationStudioResultNoRecord } from "../index.ts";

/** The library's short name: a word of the request, said as the site and as the lender. */
const HOUSE = "CityLib";
const BODY = `On ${HOUSE}, list every atlas that ${HOUSE} lends itself rather than a partner library, rated 4 or higher, going through every page. List each atlas once, with columns title, lender and rating.`;
const REQUEST = `Goal\n${BODY}`;

const STORED = [
  { title: `${HOUSE} Atlas of Rivers`, lender: `${HOUSE} Central`, rating: "4.6" },
  { title: `${HOUSE} Harbor Charts of the North`, lender: `${HOUSE} Central`, rating: "4.4" }
];
/** Left out by the lender condition alone: atlases the library lends itself whose links do not spell its short name. */
const TIDE = "Atlas of Tides and Shorelines";
const PEAKS = "Peaks and Passes Atlas";

const LINK_ON_KEPT = `lender (read "https://catalog.example/item/citylib-atlas-of-rivers/123" on a row it kept) contains ["${HOUSE}"]`;
const LINE_ON_KEPT = `lender (read "${HOUSE} Central" on a row it kept) contains ["${HOUSE}"]`;

/** The lender condition: read from each row's own link, or, where `line`, from a lender line of its own. */
function lenderCondition(line: boolean): AutomationStudioResultReadCondition {
  const values = line ? ["Harbor Partner Library", "Valley Partner Library"] : ["/item/atlas-of-tides-and-shorelines/207", "/item/peaks-and-passes-atlas/311"];
  return {
    number: 1, condition: line ? LINE_ON_KEPT : LINK_ON_KEPT, rejected: 2, alone: 2, leftOutOnlyByThis: [TIDE, PEAKS],
    leftOutObservations: values.map((value, at) => ({ source: "read" as const, page: 1, item: at + 3, readKind: "text" as const, state: "present" as const, value })),
    leftOutSettled: [TIDE, PEAKS],
    settled: "On each row in leftOutSettled the read found lender, as that row's witness in leftOutObservations gives it, and Core tested that value against condition 1 as written: each fails it."
  };
}

function summary(line: boolean): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: STORED.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "atlases", recordCount: STORED.length, refusedCount: 0, truncated: false, columns: ["title", "lender", "rating"], columnsWithheld: false,
      rowsChecked: STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: STORED.map((row) => ({ ...row })),
      processing: { collected: 2, duplicates: 0, filteredOut: 0, cut: 0, kept: 2, passes: [{ node: "read", pass: 1, rows: 2, newRows: 2 }] }
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: 4, kept: 2,
      conditions: [lenderCondition(line), { number: 2, condition: "rating atLeast 4", rejected: 0, alone: 0 }]
    }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

function record(line: boolean) {
  const run = summary(line);
  const wording = automationStudioRequestWording([{ title: "Goal", body: BODY }], run)!;
  return automationStudioResultNoRecord({ summary: run, requestText: REQUEST, wording });
}

const ROWS = STORED.map((row) => ({ label: row.title, cells: { ...row } }));

describe("a condition read on the row's own link (t659)", () => {
  it("is a label test where a left-out row's witness is a link whose path spells that row's label", () => {
    expect(automationStudioResultConditionTestsLabel({ ...lenderCondition(false), condition: `lender contains ["${HOUSE}"]` }, ROWS)).toBe(true);
  });

  it("is a label test where the value read on a kept row is a link spelling a stored row's label, absolute or root-relative", () => {
    const base: AutomationStudioResultReadCondition = { number: 1, condition: LINK_ON_KEPT, alone: 0 };
    expect(automationStudioResultConditionTestsLabel(base, ROWS)).toBe(true);
    expect(automationStudioResultConditionTestsLabel({ ...base, condition: `lender (read "/item/citylib-harbor-charts-of-the-north/88" on a row it kept) contains ["citylib"]` }, ROWS)).toBe(true);
  });

  it("tells a link apart only where its path spells the label's words in order", () => {
    expect(automationStudioResultLinkSpellsLabel("/item/citylib-atlas-of-rivers/123", `${HOUSE} Atlas of Rivers`)).toBe(true);
    expect(automationStudioResultLinkSpellsLabel("https://catalog.example/item/citylib%20atlas%20of%20rivers?ref=list", `${HOUSE} Atlas of Rivers`)).toBe(true);
    // Words out of order, a protocol-relative address, the label only in the query, and words that are no link.
    expect(automationStudioResultLinkSpellsLabel("/item/rivers-of-citylib-atlas/123", `${HOUSE} Atlas of Rivers`)).toBe(false);
    expect(automationStudioResultLinkSpellsLabel("//cdn.example/citylib-atlas-of-rivers", `${HOUSE} Atlas of Rivers`)).toBe(false);
    expect(automationStudioResultLinkSpellsLabel("/item/123?title=citylib-atlas-of-rivers", `${HOUSE} Atlas of Rivers`)).toBe(false);
    expect(automationStudioResultLinkSpellsLabel(`${HOUSE} Atlas of Rivers`, `${HOUSE} Atlas of Rivers`)).toBe(false);
  });

  it("quotes none of the rows it left out and accounts for none of them, so nothing holds it", () => {
    const named = record(false);
    expect(named.leftOut.map((row) => [row.label, row.settled, row.quotesRequest, row.testsLabel])).toEqual([[TIDE, true, false, true], [PEAKS, true, false, true]]);
    expect(named.conditions?.find((condition) => condition.number === 1)?.leftOut?.map((row) => row.accounted)).toEqual([undefined, undefined]);
  });

  it("leaves a lender line of its own one the request's words settle", () => {
    expect(automationStudioResultConditionTestsLabel(lenderCondition(true), ROWS)).toBe(false);
    const named = record(true);
    expect(named.leftOut.every((row) => row.quotesRequest && row.testsLabel === undefined)).toBe(true);
    expect(named.conditions?.find((condition) => condition.number === 1)?.leftOut?.every((row) => row.accounted?.by === "request_words")).toBe(true);
  });
});
