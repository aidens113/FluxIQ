// A stored label is never missing, even where the sentence disputes the
// condition that left out another copy of it (t659, A8 frozen pair 6 project
// towels `run-mvac0nmw-52ed30b2` step 0129). A library's atlas search whose
// `reserve is absent` condition left out the reserve copy of a stored title:
// Core measured that the title came back. No task, site, item or answer of any
// realistic scenario. And (t665, A8 frozen pair 8 candidate towels
// `run-mvam0lys-2d3eb090` steps 0069 and 0043) where a clause of the sentence
// names no row: a colon-ended lead clause before the rows, or a trailing
// clause after them; and a label spelled whole names its row whatever values
// the judge writes after it.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultNoRecord, automationStudioResultRefutedReading, automationStudioResultSentenceRows } from "../index.ts";
import { libraryRequestText, libraryRunSummary, libraryWording } from "./library-fixture.ts";

const REQUEST = "Goal\nList every atlas in the library catalogue that can be borrowed, leaving out reference-only copies, going through every page, with columns title, shelf and url.";
const STORED = [
  { title: "Rivers of the Northern Plains Atlas, 2nd Edition", shelf: "Lending", url: "/catalog/item/ATR4K2M9Q1" },
  { title: "Coastal Charts Atlas of the Western Isles", shelf: "Lending", url: "/catalog/item/ATC8W2L4P6" },
  { title: "Mountain Passes Atlas, Field Edition", shelf: "Lending", url: "/catalog/item/ATM9N3C6V4" }
];
/** Stored, and a reserve copy of each left out by condition 1 alone. */
const RIVERS = STORED[0]!.title;
const COASTAL = STORED[1]!.title;
/** Stored, with no left-out copy. */
const PASSES = STORED[2]!.title;
/** Left out by condition 1 alone, and no copy of it stored. */
const ISLANDS = "Islands of the Southern Sea Atlas, Reference";

function summary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: STORED.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "atlases", recordCount: STORED.length, refusedCount: 0, truncated: false, columns: ["title", "shelf", "url"], columnsWithheld: false,
      rowsChecked: STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: STORED.map((row) => ({ ...row })),
      processing: { collected: 3, duplicates: 0, filteredOut: 0, cut: 0, kept: 3, passes: [{ node: "read", pass: 1, rows: 3, newRows: 3 }] }
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: 6, kept: 3,
      conditions: [
        { number: 1, condition: "reserve is absent", rejected: 3, alone: 3, leftOutOnlyByThis: [RIVERS, COASTAL, ISLANDS] }
      ]
    }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

const record = () => automationStudioResultNoRecord({ summary: summary(), requestText: REQUEST });
const EXPECTED = "Every atlas that can be borrowed.";

describe("a condition said to have left out a title whose label is a stored row (t659)", () => {
  it("is refuted, whatever the sentence says of the condition: another copy was kept", () => {
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: `Condition 1 (reserve is absent) left out "${RIVERS}", a qualifying atlas.` }, record());
    expect(weighed).toEqual({ wholly: true, findings: [`"${RIVERS}" is in the stored rows: another copy of it was kept.`] });
  });

  it("is refuted over several titles said in a list, where the condition is called wrong", () => {
    const weighed = automationStudioResultRefutedReading({
      expected: EXPECTED,
      observed: `Condition 1 (reserve is absent) dropped "${RIVERS}" and "${COASTAL}" (only marked Reserve), which qualify.`
    }, record());
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings.join(" ")).toContain(`"${RIVERS}" is in the stored rows: another copy of it was kept.`);
    expect(weighed.findings.join(" ")).toContain(`"${COASTAL}" is in the stored rows: another copy of it was kept.`);
  });

  it("stands over a title no stored row is", () => {
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: `Condition 1 (reserve is absent) left out "${ISLANDS}", a qualifying atlas.` }, record());
    expect(weighed.wholly).toBe(false);
    expect(weighed.findings.join(" ")).not.toContain("is in the stored rows");
  });

  it("is not read so of a stored title no condition left a copy of: such a sentence may say the title got through", () => {
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: `Condition 1 excludes reference copies, but "${PASSES}" got through.` }, record());
    expect(weighed.findings.join(" ")).not.toContain("is in the stored rows");
  });
});

describe("a condition said to have left out stored titles, where a clause of the sentence names no row (t665)", () => {
  const COPIES = `"${RIVERS}" is in the stored rows: another copy of it was kept. "${COASTAL}" is in the stored rows: another copy of it was kept.`;

  it("is refuted in step 0069's colon form: the lead clause says the rows were dropped, the rows follow", () => {
    const observed = `But condition 1 (reserve is absent) dropped rows that are borrowable atlases: eg ${RIVERS} (Lending) and ${COASTAL} (Lending) — these are the request's items, only their copy was on reserve.`;
    expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed }, record())).toEqual({ wholly: true, findings: [COPIES] });
  });

  it("is refuted in step 0043's trailing-clause form: a clause after the rows names none", () => {
    const observed = `Condition 1 (reserve is absent) left out "${RIVERS}" and "${COASTAL}" — both are borrowable atlases the request asks for; the request only says to leave out reference-only copies, and these rows are the atlas itself.`;
    expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed }, record())).toEqual({ wholly: true, findings: [COPIES] });
  });

  it("stands in both forms over a left-out title Core did not settle", () => {
    for (const observed of [
      `But condition 1 (reserve is absent) dropped rows that are borrowable atlases: eg ${ISLANDS} (Lending) — it is the request's item.`,
      `Condition 1 (reserve is absent) left out "${ISLANDS}" — a borrowable atlas the request asks for; the request only says to leave out reference-only copies.`
    ]) {
      const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed }, record());
      expect(weighed.wholly).toBe(false);
      expect(weighed.findings.join(" ")).not.toContain("is in the stored rows");
    }
  });

  it("stands where no clause names a row at all", () => {
    const observed = "Condition 1 (reserve is absent) left out rows that are borrowable atlases: the request only says to leave out reference-only copies.";
    expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed }, record()).wholly).toBe(false);
  });
});

describe("a stored title spelled whole, then a value of the judge's own reason (t665)", () => {
  const summary = libraryRunSummary();
  const rec = automationStudioResultNoRecord({ summary, requestText: libraryRequestText(), wording: libraryWording(summary) });
  /** Stored, rated 4.6 and 4.8. */
  const HARBOR = "Harbor Lights at Midnight, Hardcover";
  const BELLS = "Silent Bells of Ashford, Large Print";

  it("still names its stored row", () => {
    const named = automationStudioResultSentenceRows(`Condition 2 left out "${HARBOR}" and "${BELLS}" — both are available today, 4.5+ mysteries.`, rec);
    expect(named.stored.map((row) => row.label)).toEqual([HARBOR, BELLS]);
  });

  it("is still held to the values written after a mention that is only a prefix", () => {
    const named = automationStudioResultSentenceRows("Condition 2 left out Silent Bells of Ashford, 4.5 stars.", rec);
    expect(named.stored).toEqual([]);
  });
});
