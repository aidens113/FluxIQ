// A read that names the rows its conditions left out together (t655) can name
// every row it saw: its counts then add up, t654's unseen-row refutation can
// fire, and t631's joint-exclusion guard can say which sets of conditions left
// a row out. One still short refutes nothing. And (t665) its together rows
// tell labels apart, so a quote of one never names a stored row by a shared
// start. A library catalogue: no task, site, item or answer of any realistic
// scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { LOANS_DUE, LOANS_LATER, loanRequestText, loanRunSummary } from "../../agreement/tests/loan-fixture.ts";
import { automationStudioResultAdviceConditions, automationStudioResultNoRecord, automationStudioResultRefutedReading, automationStudioResultSentenceRows, automationStudioResultUnseenRowClaim } from "../index.ts";

const REQUEST = "Goal\nList every hardcover mystery novel in the library catalogue rated 4 or higher, with columns title, author, rating and url. Leave out box sets.";
const STORED = [
  { title: "Harbor Lights at Midnight, Hardcover", author: "M. Ostrander", rating: "4.6", url: "/catalog/item/BKH4Q7M2X1" },
  { title: "Fog Over Penhallow Quay, Hardcover", author: "R. Tamsin", rating: "4.2", url: "/catalog/item/BKF8W2L4P6" },
  { title: "Silent Bells of Ashford, Hardcover", author: "C. Varga", rating: "4.8", url: "/catalog/item/BKS9N3C6V4" }
];
const LOW = "Quiet Streets of Dunmore, Hardcover";
const BOX = "Ashford Mysteries Box Set, Hardcover";
/** Rated low and a box set: both conditions left it out, neither alone. */
const BOTH = "Penhallow Cases Box Set, Hardcover";
/** On the unfiltered start page only: the format step removed it before the read. */
const UNSEEN = "The Lantern Keeper's Daughter, Paperback";

function summary(read: Partial<AutomationStudioResultReadAccount>): AutomationStudioRunResultSummary {
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
      nodeId: "read", definitionId: "extract_list", pagesRead: 1, stop: "ended", truncated: false, kept: 3,
      narrowedBefore: [{ nodeId: "format", label: "Choose Hardcover format", control: "Hardcover (40)", effect: "same_page" }],
      ...read
    }],
    flowShape: [{ nodeId: "format", definitionId: "click" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

/** Rating and box-set conditions, each leaving one row out alone, and `together` rows both left out. */
function twoConditions(itemsSeen: number, together?: string[]): Partial<AutomationStudioResultReadAccount> {
  return {
    itemsSeen,
    conditions: [
      { number: 1, condition: "rating atLeast 4", rejected: 1 + (together?.length ?? 1), alone: 1, leftOutOnlyByThis: [`${LOW} — rating: 3.8`], leftOutSettled: [`${LOW} — rating: 3.8`] },
      { number: 2, condition: "title not contains [\"Box Set\"]", rejected: 1 + (together?.length ?? 1), alone: 1, leftOutOnlyByThis: [BOX] }
    ],
    ...(together ? { leftOutTogether: [{ conditions: [1, 2], rows: together }] } : {})
  };
}

const record = (read: Partial<AutomationStudioResultReadAccount>) => automationStudioResultNoRecord({ summary: summary(read), requestText: REQUEST });
const EXPECTED = "Every hardcover mystery rated 4 or higher, without box sets.";
const CONDITION_MISSED = `Condition 2 missed "${UNSEEN}", a mystery rated 4.7.`;

describe("a read that names the rows its conditions left out together", () => {
  it("is whole where seen is kept, alone and together, and t654's unseen-row refutation fires on it", () => {
    const rec = record(twoConditions(6, [BOTH]));
    expect(rec.seen?.[0]?.whole).toBe(true);
    expect(rec.seenLabels).toContain(BOTH);
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: CONDITION_MISSED, advice: "Loosen condition 2." }, rec);
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings.join(" ")).toContain(`No condition saw "${UNSEEN}"`);
  });

  it("refutes nothing where the read's counts are still short: a row is named nowhere", () => {
    const short = record(twoConditions(7, [BOTH]));
    expect(short.seen?.[0]?.whole).toBe(false);
    expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed: CONDITION_MISSED, advice: "Loosen condition 2." }, short).wholly).toBe(false);
    // The same read without the together rows, as before t655.
    const unsent = record(twoConditions(6));
    expect(unsent.seen?.[0]?.whole).toBe(false);
    expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed: CONDITION_MISSED, advice: "Loosen condition 2." }, unsent).wholly).toBe(false);
  });

  it("is whole only where every row left out together may be said", () => {
    expect(record(twoConditions(6, ["(withheld)"])).seen?.[0]?.whole).toBe(false);
  });

  it("never calls a row it left out together unseen", () => {
    const sentence = `Condition 2 missed "${BOTH}", a mystery rated 4.5.`;
    const rec = record(twoConditions(6, [BOTH]));
    const named = automationStudioResultSentenceRows(sentence, rec);
    expect(automationStudioResultUnseenRowClaim(sentence, named)).toBeUndefined();
    expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed: sentence, advice: "Loosen condition 2." }, rec).findings.join(" ")).not.toContain("No condition saw");
  });
});

/** Three conditions that left nothing out alone; `sets` the condition sets that left one row each out together. */
function threeConditions(itemsSeen: number, sets: number[][]): Partial<AutomationStudioResultReadAccount> {
  const rejected = (number: number) => sets.filter((set) => set.includes(number)).length;
  return {
    itemsSeen,
    conditions: [
      { number: 1, condition: "rating atLeast 4", rejected: rejected(1), alone: 0 },
      { number: 2, condition: "title not contains [\"Box Set\"]", rejected: rejected(2), alone: 0 },
      { number: 3, condition: "format equals \"Hardcover\"", rejected: rejected(3), alone: 0 }
    ],
    leftOutTogether: sets.map((set, index) => ({ conditions: set, rows: [`Left Together ${index + 1}, Paperback`] }))
  };
}

describe("advice to remove several conditions, where the read names the rows they left out together", () => {
  const ADVICE = "Remove conditions 1 and 2.";

  it("is weighed by those conditions where no row failed only the named ones", () => {
    const advised = automationStudioResultAdviceConditions(ADVICE, record(threeConditions(5, [[1, 3], [2, 3]])));
    expect(advised?.conditions.map((condition) => condition.number)).toEqual([1, 2]);
  });

  it("stands where a row failed only the named conditions: removing them brings it back", () => {
    expect(automationStudioResultAdviceConditions(ADVICE, record(threeConditions(5, [[1, 2], [2, 3]])))).toBeUndefined();
  });

  it("stands as before t655 where the listing is short of the read's counts", () => {
    expect(automationStudioResultAdviceConditions(ADVICE, record(threeConditions(6, [[1, 3], [2, 3]])))).toBeUndefined();
  });
});

describe("the rows left out together, in the pools a label is told apart in (t665)", () => {
  /** Stored: a line's paperback omnibus. */
  const OMNIBUS = "Penhallow Cases Omnibus Edition, Paperback";
  /** Left out together, its start shared with the stored omnibus. */
  const OMNIBUS_BOX = "Penhallow Cases Omnibus Edition Box Set, Slipcase";
  const withOmnibus = (together?: string[]) => {
    const base = summary(twoConditions(6 + (together?.length ?? 0) - 1, together));
    const set = base.recordSets[0]!;
    const sampleRows = [...(set.sampleRows ?? []), { title: OMNIBUS, author: "R. Tamsin", rating: "4.4", url: "/catalog/item/BKP3D7R1M8" }];
    return automationStudioResultNoRecord({
      summary: { ...base, totalRecordCount: 4, recordSets: [{ ...set, recordCount: 4, rowsChecked: 4, sampleRows }] },
      requestText: REQUEST
    });
  };

  it("a quote of a row left out together names no stored row", () => {
    const rec = withOmnibus([OMNIBUS_BOX]);
    expect(rec.unnamed).toEqual([OMNIBUS_BOX]);
    const named = automationStudioResultSentenceRows(`The result includes "${OMNIBUS_BOX}", a box set.`, rec);
    expect(named.stored).toEqual([]);
    expect(named.unmatched).toBe(true);
  });

  it("names the stored row as before where the read names no together rows", () => {
    const named = automationStudioResultSentenceRows(`The result includes "${OMNIBUS_BOX}", a box set.`, withOmnibus());
    expect(named.stored.map((row) => row.label)).toEqual([OMNIBUS]);
  });

  it("still names the stored row by its own label", () => {
    const named = automationStudioResultSentenceRows(`The result includes "${OMNIBUS}", which is rated 4.4.`, withOmnibus([OMNIBUS_BOX]));
    expect(named.stored.map((row) => row.label)).toEqual([OMNIBUS]);
  });
});

// t752: a record set of working rows -- an earlier read of the same list, its
// rows walked by a loop before a later read stored the answer
// (`../../read-account/working-sets.ts`) -- holds no row of the result, so a
// no is never weighed as though the answer held its rows. The made-up library
// account of `../../agreement/tests/loan-fixture.ts`.
describe("working rows in Core's record (t752)", () => {
  it("are no stored rows: only the answer's rows are stored, and counted", () => {
    const record = automationStudioResultNoRecord({ summary: loanRunSummary(), requestText: loanRequestText() });
    expect(record.stored.map((row) => row.label)).toEqual(LOANS_DUE.map((book) => book.title));
    expect(record.storedCount).toBe(LOANS_DUE.length);
    // The rows the answer's condition alone left out are left-out rows, held to the request's words as before.
    expect(record.leftOut.map((row) => row.label)).toEqual(LOANS_LATER.map((book) => book.title));
  });

  it("are stored rows where no read is flagged as working rows", () => {
    const record = automationStudioResultNoRecord({ summary: loanRunSummary({ working: false }), requestText: loanRequestText() });
    expect(record.stored).toHaveLength(LOANS_DUE.length + LOANS_LATER.length + LOANS_DUE.length);
  });
});
