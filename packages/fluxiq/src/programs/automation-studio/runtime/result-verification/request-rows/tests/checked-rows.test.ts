// Core's check of the rows a judgement names, from live run
// `run-muw60j7c-bb7c9a62` (debug C-5): the result judge of step 0039 said the
// Plus condition "alone excluded 6 rows that satisfy the request, including ...
// B0J5MCMBAY ... B07Z1RZGJG". Both are in the stored result, and the re-author
// followed that reading and threw away the answer it held.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts.ts";
import { automationStudioResultCheckedRows, automationStudioResultCheckedRowsNamed } from "../index.ts";
import { RUN_MUW60J7C_PAIRS_LEFT_OUT, RUN_MUW60J7C_RESULT_JUDGE, runMuw60j7cRunSummary, runMuw60j7cTestSummary } from "./run-muw60j7c.ts";
import { SOIL_BIN, SOIL_CONDITIONS, SOIL_SCOOP, SOIL_SIEVE, soilRunSummary } from "./potting-soil-fixture.ts";

const judged = (): string => {
  const { summary, diagnosis } = RUN_MUW60J7C_RESULT_JUDGE;
  return [diagnosis.expected, diagnosis.observed, diagnosis.changed, summary].join("\n");
};

describe("the rows a judgement names, checked against what the run holds", () => {
  const checked = automationStudioResultCheckedRows(runMuw60j7cRunSummary(), judged());

  it("says the two rows it calls left out are in the result, and that advice resting on it is not supported", () => {
    const misread = checked.filter((line) => line.includes("the check misread which rows were left out"));
    expect(misread).toHaveLength(2);
    expect(misread[0]).toContain("Aurelle Echo Wireless Earbuds, Bluetooth 5.3 Headphones with 40H Playtime, Built-in Mic, Low Latency Gaming Mode, Ivory (B0J5MCMBAY) is in the result");
    expect(misread[1]).toContain("Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, IPX7 Waterproof, Touch Control, Sage (B07Z1RZGJG) is in the result");
    expect(misread.join("\n")).toContain("advice resting on that reading is not supported");
  });

  it("says which named rows each condition really left out alone, and never calls those misread", () => {
    const plus = checked.find((line) => line.includes("(plus is present)"));
    expect(plus).toContain("Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, IPX7 Waterproof, LED Power Display, Graphite (B0FLQUDT3X)");
    expect(plus).toContain("Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Touch Control, Deep Bass, Sage (B0PXG323U8)");
    expect(plus).not.toContain("B0J5MCMBAY");
    const name = checked.find((line) => line.includes("(name not contains"));
    expect(name).toContain("Lumo Audio Drift Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Touch Control, White");
    const sponsored = checked.find((line) => line.includes("(sponsored is absent)"));
    expect(sponsored).toContain("(B0DPN4ANC7)");
    expect(sponsored).toContain("(B0KRUNHK42)");
    expect(checked.filter((line) => line.includes("misread")).join("\n")).not.toMatch(/B0FLQUDT3X|B0PXG323U8|B0DPN4ANC7/u);
  });

  it("copies none of the judgement's own prose", () => {
    for (const line of checked) {
      expect(line).not.toContain("satisfy the request");
      expect(line).not.toContain("aria-label");
    }
  });

  it("says nothing for a judgement that names no row", () => {
    expect(automationStudioResultCheckedRows(runMuw60j7cRunSummary(), "The result has the wrong rows; fix the conditions.")).toEqual([]);
  });

  it("does not call a duplicated row left out (B0PXHP88KT appears twice)", () => {
    expect(checked.join("\n")).not.toContain("B0PXHP88KT");
  });
});

// The same rows in structured form beside the lines (live run
// `run-mux6naez-6c20f26e`, R3-3): what a repair compares a rerun of the read with.
describe("the rows the checked lines name, per read and condition", () => {
  /** A line's rows as it lists them, less the ids and "also in the result" it adds. */
  const listed = (line: string): string[] => line.slice(line.indexOf("the check names: ") + "the check names: ".length).replace(/\.$/u, "").split("; ")
    .map((row) => row.replace(/ \(also in the result\)$/u, "").replace(/ \([A-Z0-9, ]+\)$/u, ""));

  it("agree with the lines: one entry per line that says a condition alone left rows out, with exactly its rows and ids", () => {
    const summary = runMuw60j7cRunSummary();
    const lines = automationStudioResultCheckedRows(summary, judged());
    const named = automationStudioResultCheckedRowsNamed(summary, lines);
    const alone = lines.filter((line) => line.includes("alone left out"));
    expect(alone.length).toBeGreaterThan(0);
    expect(named).toHaveLength(alone.length);
    for (const line of alone) {
      const entry = named.find((candidate) => line.startsWith(`Read ${candidate.nodeId}: the ${candidate.condition}`));
      expect(entry, line).toBeDefined();
      expect(entry!.rows.map((row) => row.label)).toEqual(listed(line));
      for (const row of entry!.rows) for (const id of row.ids ?? []) expect(line).toContain(`${row.label} (${id}`);
    }
    const sponsored = named.find((entry) => entry.condition.endsWith("(sponsored is absent)"));
    expect(sponsored?.rows.flatMap((row) => row.ids ?? [])).toEqual(expect.arrayContaining(["B0DPN4ANC7", "B0KRUNHK42"]));
    // A row the lines call misread is named by no condition.
    expect(JSON.stringify(named)).not.toContain("B0J5MCMBAY");
  });

  it("name a build test's read by its step, with the rows its name condition left out", () => {
    const summary = runMuw60j7cTestSummary();
    const lines = automationStudioResultCheckedRows(summary, `The name condition alone excluded genuine earbuds: ${RUN_MUW60J7C_PAIRS_LEFT_OUT.join("; ")}.`);
    expect(lines.join("\n")).toContain("Step 10: the condition \"name\"");
    expect(automationStudioResultCheckedRowsNamed(summary, lines)).toEqual([{ step: 10, condition: "condition \"name\"", rows: RUN_MUW60J7C_PAIRS_LEFT_OUT.map((label) => ({ label })) }]);
  });

  it("are none for no lines, and never a label that only starts a listed one", () => {
    const summary = runMuw60j7cTestSummary();
    expect(automationStudioResultCheckedRowsNamed(summary, [])).toEqual([]);
    const cut = RUN_MUW60J7C_PAIRS_LEFT_OUT[1]!.replace(" with Wireless Charging Case", "");
    const line = `Step 10: the condition "name" alone left out this row the check names: ${cut} with Wireless Charging Case, Gift Box.`;
    expect(automationStudioResultCheckedRowsNamed(summary, [line])).toEqual([]);
  });
});

// t474, lane C round 9 (`run-mv5q4j5c-49bfb5e2`): correct advice was twice called "not supported". Trial 2's
// judges said two stored accessories are rows "the request excludes"; trial 4's named a left-out title that a
// stored title is a strict prefix of. A generic catalogue: a stored "... Blue" and a left-out "... Blue with Carry
// Bag", and two stored accessories, one carrying a measure ("2600mAh") in its title.
describe("a judgement's left-out words and labels, read for what they say of the run", () => {
  const LANTERN_PACK = "Solar Lantern Replacement Battery Pack, 2600mAh Cell, Black";
  const HIP_BELT = "Trailmark Spare Hip Belt for Daypack Backpacks, Padded, Black";
  const BLUE = "Ridgeway Trek Hiking Backpack, 30L, Rain Cover, Blue";
  const BLUE_WITH_BAG = `${BLUE} with Carry Bag`;
  const STORED = [BLUE, LANTERN_PACK, HIP_BELT, "Summit Line Daypack Hiking Backpack, 20L, Hydration Sleeve, Green"];
  const summary = (): AutomationStudioRunResultSummary => ({
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: STORED.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{ datasetId: "web.output.dom-extract_list", recordCount: STORED.length, refusedCount: 0, truncated: false, columns: ["name", "url"], columnsWithheld: false,
      rowsChecked: STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: STORED.map((name, index) => ({ name, url: `/item/${index + 1}` })) }],
    reads: [{ nodeId: "node.read", definitionId: "web.output.dom-extract_list", pagesRead: 2, truncated: false, itemsSeen: 30, kept: 4,
      conditions: [{ condition: "name not matches \"Carry Bag\"", rejected: 1, alone: 1, leftOutOnlyByThis: [BLUE_WITH_BAG] }] }],
    flowShape: [], withheld: false
  });
  const misread = (judgement: string): string[] => automationStudioResultCheckedRows(summary(), judgement).filter((line) => line.includes("misread"));

  it("does not call rows misread when the request is what excludes them", () => {
    expect(misread(`Two are accessories the request excludes: "${LANTERN_PACK}" and "${HIP_BELT}".`)).toEqual([]);
    expect(misread(`The stored rows include accessories that the request explicitly excludes: "${LANTERN_PACK}".`)).toEqual([]);
    expect(misread(`The instruction says to leave out "${HIP_BELT}".`)).toEqual([]);
  });

  it("does not call rows misread when the judgement says they should be left out, or were not", () => {
    expect(misread(`"${LANTERN_PACK}" should be excluded.`)).toEqual([]);
    expect(misread(`Add a condition to exclude "${HIP_BELT}".`)).toEqual([]);
    expect(misread(`"${LANTERN_PACK}" was not filtered out.`)).toEqual([]);
    expect(misread(`The Flow has no condition that excludes "${HIP_BELT}".`)).toEqual([]);
  });

  it("still calls a stored row misread when the judgement says the run left it out", () => {
    const lines = misread(`The name condition excluded "${LANTERN_PACK}".`);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`${LANTERN_PACK} is in the result`);
  });

  it("never takes a measure in a title for a row's id", () => {
    const lines = automationStudioResultCheckedRows(summary(), `The name condition excluded "${LANTERN_PACK}".`);
    expect(lines.join("\n")).not.toContain("2600MAH");
  });

  it("gives a mention of the longer title to that row, never to the stored row its title starts with", () => {
    const lines = automationStudioResultCheckedRows(summary(), `One backpack was left out by the name condition alone: "${BLUE_WITH_BAG}".`);
    expect(lines.filter((line) => line.includes("misread"))).toEqual([]);
    expect(lines).toEqual([`Read node.read: the condition 1 (name not matches "Carry Bag") alone left out this row the check names: ${BLUE_WITH_BAG}.`]);
  });

  it("still names the shorter stored row where the judgement names it alone", () => {
    const lines = misread(`The run dropped "${BLUE}".`);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`${BLUE} is in the result`);
  });
});

// t489, lane C round 13 (`run-mv66s8yl-fbbfa221`, D1): the judge named a left-out row by its title and its own price
// and rating -- "<title>, $50.00, 4.6" -- and that title's four-word start was the start of a stored row with another
// price and rating. The left-out row was in no condition's witness list, so the prefix named only the stored one, and
// Core called a correct judge's reading misread. A prefix names a stored row only when the values the judgement writes
// beside it agree with that row's cells; a price or rating that differs names another row.
describe("a row named by its title beside values its stored cells do not hold", () => {
  const TITLE = "Fernvale Trail Lamp 2";
  const STORED = [
    { name: `${TITLE} Rechargeable Headlamp, Graphite`, price: "$42.00", rating: "4.3" },
    { name: "Lumen Ridge Camp Lantern, Dimmable, Olive", price: "$35.00", rating: "4.1" },
    { name: "Northpine Pocket Torch, Aluminium, Black", price: "$18.00", rating: "4.7" }
  ];
  const summary = (): AutomationStudioRunResultSummary => ({
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: STORED.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{ datasetId: "web.output.dom-extract_list", recordCount: STORED.length, refusedCount: 0, truncated: false, columns: ["name", "price", "rating"], columnsWithheld: false,
      rowsChecked: STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: STORED.map((row) => ({ ...row })) }],
    reads: [{ nodeId: "node.read", definitionId: "web.output.dom-extract_list", pagesRead: 1, truncated: false, itemsSeen: 12, kept: 3, conditions: [] }],
    flowShape: [], withheld: false
  });
  const misread = (judgement: string): string[] => automationStudioResultCheckedRows(summary(), judgement).filter((line) => line.includes("misread"));

  it("does not take a left-out row with another price and rating for the stored row its title starts like", () => {
    expect(misread(`The condition left out "${TITLE}, $50.00, 4.6", which the request asks for.`)).toEqual([]);
    expect(misread(`The run left out ${TITLE} at $50.00.`)).toEqual([]);
  });

  it("still names the stored row when the values beside its title are its own, or when none are written", () => {
    expect(misread(`The run left out "${TITLE}, $42.00, 4.3".`)).toHaveLength(1);
    expect(misread(`The run left out ${TITLE}.`)).toHaveLength(1);
    // A bound the request sets is not the row's own value.
    expect(misread(`The run left out ${TITLE}, though it is under $50.00.`)).toHaveLength(1);
  });

  it("reads each mention's values up to the next row it names", () => {
    const lines = misread(`The run left out ${TITLE} at $42.00 and Northpine Pocket Torch, Aluminium at $18.00.`);
    expect(lines).toHaveLength(2);
  });
});

// A8 bigbox `run-mv9a4aj0-f9a81d13` step 0086 (t628): a judge named a stored row
// of the wrong kind and then two rows "seen and only excluded by rating"; the
// left-out word was given to the stored row too, and correct advice was called
// "not supported". On another kind of site (`potting-soil-fixture.ts`).
describe("a left-out word in a sentence that names rows a condition left out (t628)", () => {
  const RATING = `the condition 2 (${SOIL_CONDITIONS.rating})`;

  it("belongs to the rows that condition left out, and calls no stored row named before it misread", () => {
    const sentence = `However, the stored rows include items that are not bags of potting soil: "${SOIL_SCOOP.name}" (a scoop) and, on the read's own evidence, "${SOIL_SIEVE}" and "${SOIL_BIN}" were seen and only excluded by rating, not by kind.`;
    const checked = automationStudioResultCheckedRows(soilRunSummary(), sentence);
    expect(checked.join("\n")).not.toContain("misread");
    const rating = checked.find((line) => line.includes(RATING));
    expect(rating).toContain(SOIL_SIEVE);
    expect(rating).toContain(SOIL_BIN);
    expect(rating).not.toContain(SOIL_SCOOP.name);
  });

  it("still calls a stored row misread where the left-out word is said before it, as t474's origin did", () => {
    const sentence = `The rating condition alone excluded rows the request asks for, including ${SOIL_SIEVE} and ${SOIL_SCOOP.name}.`;
    const checked = automationStudioResultCheckedRows(soilRunSummary(), sentence);
    expect(checked.filter((line) => line.includes("misread"))).toEqual([
      `${SOIL_SCOOP.name} is in the result, although the check calls it left out: the check misread which rows were left out; advice resting on that reading is not supported.`
    ]);
    expect(checked.find((line) => line.includes(RATING))).toContain(SOIL_SIEVE);
  });

  it("still calls a stored row misread in a sentence that names no row a condition left out", () => {
    const checked = automationStudioResultCheckedRows(soilRunSummary(), `"${SOIL_SCOOP.name}" was dropped by the read.`);
    expect(checked.join("\n")).toContain(`${SOIL_SCOOP.name} is in the result, although the check calls it left out`);
  });
});
