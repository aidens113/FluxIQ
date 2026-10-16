// A no saying a condition left out a row no read saw is refuted where Core can
// list every row the read saw and a step narrowed the page first (t654); a
// sentence blaming that step stands, and a row the read saw goes the way it
// always went. A library catalogue read after a format step: no task, site,
// item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import {
  automationStudioResultNoRecord,
  automationStudioResultRefutedReading,
  automationStudioResultSentenceRows,
  automationStudioResultUnseenRowClaim
} from "../index.ts";

const REQUEST = "Goal\nList every hardcover mystery novel in the library catalogue rated 4 or higher, with columns title, author, rating and url. Leave out box sets.";
const STORED = [
  { title: "Harbor Lights at Midnight, Hardcover", author: "M. Ostrander", rating: "4.6", url: "/catalog/item/BKH4Q7M2X1" },
  { title: "Fog Over Penhallow Quay, Hardcover", author: "R. Tamsin", rating: "4.2", url: "/catalog/item/BKF8W2L4P6" },
  { title: "Silent Bells of Ashford, Hardcover", author: "C. Varga", rating: "4.8", url: "/catalog/item/BKS9N3C6V4" }
];
/** Left out by the rating bound alone: a row the read saw. */
const LOW = "Quiet Streets of Dunmore, Hardcover";
/** Left out by the box-set condition alone. */
const BOX = "Ashford Mysteries Box Set, Hardcover";
/** A title on the unfiltered start page only: the format step removed it before the read. */
const UNSEEN = "The Lantern Keeper's Daughter, Paperback";

function summary(options: { itemsSeen?: number; narrowed?: boolean } = {}): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: STORED.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "mysteries", recordCount: STORED.length, refusedCount: 0, truncated: false, columns: ["title", "author", "rating", "url"], columnsWithheld: false,
      rowsChecked: STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: STORED.map((row) => ({ ...row })),
      processing: { collected: 3, duplicates: 0, filteredOut: 0, cut: 0, kept: 3, passes: [{ node: "read", pass: 1, rows: 3, newRows: 3 }] }
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: options.itemsSeen ?? 5, kept: 3,
      conditions: [
        { number: 1, condition: "rating atLeast 4", rejected: 1, alone: 1, leftOutOnlyByThis: [`${LOW} — rating: 3.8`], leftOutSettled: [`${LOW} — rating: 3.8`] },
        { number: 2, condition: "title not contains [\"Box Set\"]", rejected: 1, alone: 1, leftOutOnlyByThis: [BOX] }
      ],
      ...(options.narrowed === false ? {} : { narrowedBefore: [{ nodeId: "format", label: "Choose Hardcover format", control: "Hardcover (40)", effect: "same_page" as const }] })
    }],
    flowShape: [{ nodeId: "format", definitionId: "click" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

const record = (options: Parameters<typeof summary>[0] = {}) => automationStudioResultNoRecord({ summary: summary(options), requestText: REQUEST });
const EXPECTED = "Every hardcover mystery rated 4 or higher, without box sets.";
const CONDITION_MISSED = `Condition 2 missed "${UNSEEN}", a mystery rated 4.7.`;
const STEP_REMOVED = `The Format step removed "${UNSEEN}", which should be included.`;

describe("a condition said to have left out a row no read saw", () => {
  it("is refuted where the read's counts name every row it saw and a step narrowed the page first", () => {
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: CONDITION_MISSED, advice: "Loosen condition 2." }, record());
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings.join(" ")).toContain(`No condition saw "${UNSEEN}": it is in none of the rows the read saw, so it never reached the read.`);
    expect(weighed.findings.join(" ")).toContain("\"Choose Hardcover format\" acted on the page before the read");
  });

  it("stands where the sentence blames the step that narrowed the page", () => {
    const rec = record();
    expect(automationStudioResultUnseenRowClaim(STEP_REMOVED, automationStudioResultSentenceRows(STEP_REMOVED, rec))).toBeUndefined();
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: `${CONDITION_MISSED} ${STEP_REMOVED}`, advice: "Read every format." }, rec);
    expect(weighed.wholly).toBe(false);
  });

  it("is left on the existing path for a row the read saw", () => {
    const sentence = `Condition 1 missed "${LOW}", a mystery the request asks for.`;
    const named = automationStudioResultSentenceRows(sentence, record());
    expect(named.unmatched).toBe(false);
    expect(named.leftOut.map((row) => row.label)).toEqual([LOW]);
    expect(automationStudioResultUnseenRowClaim(sentence, named)).toBeUndefined();
    expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed: sentence, advice: "Loosen condition 1." }, record()).findings.join(" ")).not.toContain("No condition saw");
  });

  it("is not refuted where the read's counts do not add up: a row two conditions both rejected is in no label list", () => {
    const rec = record({ itemsSeen: 6 });
    expect(rec.seen?.[0]?.whole).toBe(false);
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: CONDITION_MISSED, advice: "Loosen condition 2." }, rec);
    expect(weighed.wholly).toBe(false);
    expect(weighed.findings.join(" ")).not.toContain("No condition saw");
  });

  it("is not refuted where no step narrowed the page before the read", () => {
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: CONDITION_MISSED, advice: "Loosen condition 2." }, record({ narrowed: false }));
    expect(weighed.wholly).toBe(false);
  });
});
