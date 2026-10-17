// A row a read's condition left out of what the Flow acted on, that another
// read stored, is no copy of a kept row (t691, A8 `run-mvbr0w7e-6a01c05b`,
// paraphrased to a library's loans): which read stored it (`../summary-reads.ts`),
// how the judge's copy says it (`../summary-with-also-in-result.ts`,
// `../summary-with-row-ids.ts`), and what a yes over it must say
// (`../unquoted-rows.ts`, `../row-naming.ts`, `../stored-line.ts`).
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultReadCondition } from "../../read-condition.ts";
import { automationStudioRequestTextNamesRead } from "../row-naming.ts";
import { AUTOMATION_STUDIO_REQUEST_ROWS_STORED_LINE_OPENING, automationStudioRequestRowsStoredLine } from "../stored-line.ts";
import { automationStudioRequestRowsStoredBy } from "../summary-reads.ts";
import { automationStudioResultSummaryWithAlsoInResult } from "../summary-with-also-in-result.ts";
import { automationStudioResultSummaryWithRowIds } from "../summary-with-row-ids.ts";
import type { AutomationStudioRequestRowsStoredMark } from "../types.ts";
import { automationStudioResultLeftOutRowsUnquoted } from "../unquoted-rows.ts";
import {
  RENEWALS_ACT_READ, RENEWALS_LEFT_OUT, RENEWALS_LEFT_OUT_ROWS, RENEWALS_LIST_READ, RENEWALS_REQUEST_EVERY_LOAN, RENEWALS_YES, RENEWALS_YES_EXPLAINED,
  renewalsRunSummary, renewalsWording
} from "./renewals-fixture.ts";

type MarkedCondition = AutomationStudioResultReadCondition & AutomationStudioRequestRowsStoredMark;
const TITLES = RENEWALS_LEFT_OUT.map(([title]) => title);
const reply = (diagnosis: { expected?: string; observed?: string }, summaryText?: string) => [diagnosis.expected, diagnosis.observed, summaryText].filter(Boolean).join("\n");

describe("which read stored a left-out row", () => {
  const storedBy = automationStudioRequestRowsStoredBy(renewalsRunSummary().recordSets);

  it("names the other reads that stored it, where the read that left it out stored no copy", () => {
    expect(storedBy(RENEWALS_ACT_READ, TITLES[0]!)).toEqual([RENEWALS_LIST_READ]);
  });

  it("names none where that read stored it too, where it is not stored, or where a set holding it names no read", () => {
    expect(storedBy(RENEWALS_LIST_READ, TITLES[0]!)).toBeUndefined();
    expect(storedBy(RENEWALS_ACT_READ, "Never Borrowed")).toBeUndefined();
    const summary = renewalsRunSummary();
    delete summary.recordSets[0]!.processing;
    expect(automationStudioRequestRowsStoredBy(summary.recordSets)(RENEWALS_ACT_READ, TITLES[0]!)).toBeUndefined();
  });
});

describe("the judge's copy of rows another read stored", () => {
  it("lists them in storedThoughLeftOut with Core's sentence naming that read, never as another copy of a kept row", () => {
    const condition = automationStudioResultSummaryWithAlsoInResult(renewalsRunSummary()).reads![0]!.conditions![0]! as MarkedCondition;
    expect(condition.storedThoughLeftOut).toEqual(RENEWALS_LEFT_OUT_ROWS);
    expect(condition.storedAnyway).toContain(`condition 1 (daysOverdue atLeast 5) left the rows in storedThoughLeftOut out of what the Flow acted on, and read ${RENEWALS_LIST_READ} stored them`);
    expect(condition.storedAnyway).toContain("the request's own words that ask for that row in the answer");
    expect(condition).not.toHaveProperty("leftOutAlsoInResult");
    expect(condition).not.toHaveProperty("alsoInResult");
  });

  it("keeps a copy the same read stored as also in the result", () => {
    const summary = renewalsRunSummary();
    summary.recordSets[0]!.processing!.passes.push({ node: RENEWALS_ACT_READ, pass: 2, rows: 8, newRows: 0 });
    const condition = automationStudioResultSummaryWithAlsoInResult(summary).reads![0]!.conditions![0]! as MarkedCondition;
    expect(condition.leftOutAlsoInResult).toEqual(RENEWALS_LEFT_OUT_ROWS);
    expect(condition).not.toHaveProperty("storedThoughLeftOut");
  });

  it("gives each such row Core's id, settled or not: a yes must name it", () => {
    const ids = automationStudioResultSummaryWithRowIds(automationStudioResultSummaryWithAlsoInResult(renewalsRunSummary())).reads![0]!.conditions![0]!;
    expect(ids.leftOutOnlyByThis!.every((row) => row.startsWith("[row "))).toBe(true);
  });
});

describe("a yes over rows another read stored", () => {
  it("is held where it never names each beside that read and the request's words (judge 0032's reply)", () => {
    const unquoted = automationStudioResultLeftOutRowsUnquoted(renewalsRunSummary(), reply(RENEWALS_YES.diagnosis, RENEWALS_YES.summaryText), renewalsWording());
    expect(unquoted).toEqual([{ nodeId: RENEWALS_ACT_READ, condition: "condition 1 (daysOverdue atLeast 5)", rows: RENEWALS_LEFT_OUT_ROWS, stored: [RENEWALS_LIST_READ] }]);
  });

  it("is taken where it names each beside that read and quotes the request's words asking for it", () => {
    const wording = renewalsWording(RENEWALS_REQUEST_EVERY_LOAN);
    expect(automationStudioResultLeftOutRowsUnquoted(renewalsRunSummary(), RENEWALS_YES_EXPLAINED, wording)).toEqual([]);
  });

  it("is held where a row is named with a quote but not beside the read that stored it", () => {
    const wording = renewalsWording(RENEWALS_REQUEST_EVERY_LOAN);
    const unnamed = RENEWALS_YES_EXPLAINED.replace("s14 stores", "The table stores");
    expect(automationStudioResultLeftOutRowsUnquoted(renewalsRunSummary(), unnamed, wording)).toEqual([
      { nodeId: RENEWALS_ACT_READ, condition: "condition 1 (daysOverdue atLeast 5)", rows: RENEWALS_LEFT_OUT_ROWS, stored: [RENEWALS_LIST_READ] }
    ]);
  });

  it("still owes the settled condition's one quote of its bound, as any left-out row's", () => {
    const wording = renewalsWording(RENEWALS_REQUEST_EVERY_LOAN);
    const noBound = "s14 stores Paper Lanterns, The Long Field, North of Nowhere and Glass Harbour because the request asks for \"every loan on the list, renewed or not\".";
    const unquoted = automationStudioResultLeftOutRowsUnquoted(renewalsRunSummary(), noBound, wording);
    expect(unquoted).toEqual([{ nodeId: RENEWALS_ACT_READ, condition: "condition 1 (daysOverdue atLeast 5)", rows: RENEWALS_LEFT_OUT_ROWS, bound: true }]);
  });

  it("is said in Core's line as rows the result keeps, naming the read that stored them", () => {
    const line = automationStudioRequestRowsStoredLine({ nodeId: RENEWALS_ACT_READ, condition: "condition 1 (daysOverdue atLeast 5)", rows: RENEWALS_LEFT_OUT_ROWS.slice(0, 2), stored: [RENEWALS_LIST_READ] });
    expect(line.startsWith(AUTOMATION_STUDIO_REQUEST_ROWS_STORED_LINE_OPENING)).toBe(true);
    expect(line).toContain(`which condition 1 (daysOverdue atLeast 5) left out of what the Flow acted on (Read ${RENEWALS_ACT_READ}) and read ${RENEWALS_LIST_READ} stored -- ${RENEWALS_LEFT_OUT_ROWS[0]} | ${RENEWALS_LEFT_OUT_ROWS[1]}`);
    expect(line).not.toContain("the condition");
  });
});

describe("a read named in a reply", () => {
  it("is named by its whole node id or its last part, as a whole token and without case", () => {
    expect(automationStudioRequestTextNamesRead("Renewed table s14 holds all 8 rows.", RENEWALS_LIST_READ)).toBe(true);
    expect(automationStudioRequestTextNamesRead(`Read ${RENEWALS_LIST_READ}.`, RENEWALS_LIST_READ)).toBe(true);
    expect(automationStudioRequestTextNamesRead("S14 stores them", RENEWALS_LIST_READ)).toBe(true);
    expect(automationStudioRequestTextNamesRead("Step s140 stores them", RENEWALS_LIST_READ)).toBe(false);
    expect(automationStudioRequestTextNamesRead("The table stores them", RENEWALS_LIST_READ)).toBe(false);
  });
});
