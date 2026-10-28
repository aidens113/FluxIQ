// A row a read's condition left out of what the Flow acted on, that another
// read stored, is no copy of a kept row (t691, A8 `run-mvbr0w7e-6a01c05b`,
// paraphrased to a library's loans): which read stored it (`../summary-reads.ts`),
// how the judge's copy says it (`../summary-with-also-in-result.ts`,
// `../summary-with-row-ids.ts`), and what a yes over it must say
// (`../unquoted-rows.ts`, `../row-naming.ts`, `../stored-line.ts`).
//
// And never working rows (t752): where a read lists every row with no
// condition, a step is repeated over its rows, and a later read of the same
// list keeps the answer, Core flags the first read (`workingRows`), and its
// record set holds no row "stored though left out" and never holds a yes
// (`../../read-account/working-sets.ts`). Shown on a made-up recipe archive;
// t691's loans, with the act read flagged too, are still marked.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import type { AutomationStudioResultReadCondition } from "../../read-condition.ts";
import { automationStudioResultKeptWithoutAskedColumn } from "../kept-without-asked-column.ts";
import { automationStudioRequestWording } from "../request-wording.ts";
import { automationStudioRequestTextNamesRead } from "../row-naming.ts";
import { AUTOMATION_STUDIO_REQUEST_ROWS_STORED_LINE_OPENING, automationStudioRequestRowsStoredLine } from "../stored-line.ts";
import { automationStudioRequestRowsReads, automationStudioRequestRowsStoredBy } from "../summary-reads.ts";
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
  const storedBy = automationStudioRequestRowsStoredBy(renewalsRunSummary());

  it("names the other reads that stored it, where the read that left it out stored no copy", () => {
    expect(storedBy(RENEWALS_ACT_READ, TITLES[0]!)).toEqual([RENEWALS_LIST_READ]);
  });

  it("names none where that read stored it too, where it is not stored, or where a set holding it names no read", () => {
    expect(storedBy(RENEWALS_LIST_READ, TITLES[0]!)).toBeUndefined();
    expect(storedBy(RENEWALS_ACT_READ, "Never Borrowed")).toBeUndefined();
    const summary = renewalsRunSummary();
    delete summary.recordSets[0]!.processing;
    expect(automationStudioRequestRowsStoredBy(summary)(RENEWALS_ACT_READ, TITLES[0]!)).toBeUndefined();
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
    // Unsettled: a settled copy is accounted for by its condition's own `settled`, and is not listed (live-lane-1 fix 4).
    const settled = automationStudioResultSummaryWithAlsoInResult(structuredClone(summary)).reads![0]!.conditions![0]! as MarkedCondition;
    expect(settled).not.toHaveProperty("leftOutAlsoInResult");
    expect(settled).not.toHaveProperty("storedThoughLeftOut");
    delete summary.reads![0]!.conditions![0]!.leftOutSettled;
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
  it("does not hide genuinely retained answer rows merely because their read feeds a control loop", () => {
    const summary = renewalsRunSummary();
    expect(summary.recordSets).toHaveLength(2);
    // Ownership must change at capture, never by teaching this matcher to
    // ignore a stored answer based on a helper name or the downstream acts.
    expect(automationStudioResultLeftOutRowsUnquoted(summary, reply(RENEWALS_YES.diagnosis, RENEWALS_YES.summaryText), renewalsWording()))
      .toMatchObject([{ stored: [RENEWALS_LIST_READ], rows: RENEWALS_LEFT_OUT_ROWS }]);
  });
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
    expect(unquoted).toEqual([{ nodeId: RENEWALS_ACT_READ, condition: "condition 1 (daysOverdue atLeast 5)", rows: RENEWALS_LEFT_OUT_ROWS, bound: true, boundKind: "bound" }]);
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

// A recipe archive, made up: the first read lists all nine recipes and every
// read collects its rows into a record set of its own; a display-only press
// opens each recipe's card once per row of that read; the second read of the
// same list keeps the recipes ready in at most 20 minutes and stores the answer.
const RECIPES_SOURCE_READ = "node.recipes.quick.s3";
const RECIPES_ANSWER_READ = "node.recipes.quick.s6";
const RECIPES_ANSWER: ReadonlyArray<readonly [string, string]> = [["Lemon Rice", "15"], ["Herb Omelette", "10"], ["Cucumber Salad", "5"]];
const RECIPES_LEFT_OUT: ReadonlyArray<readonly [string, string]> = [
  ["Slow Beef Stew", "180"], ["Baked Ziti", "45"], ["Roast Chicken", "90"], ["Mushroom Risotto", "40"], ["Apple Pie", "75"], ["Lentil Soup", "35"]
];
const RECIPES_LEFT_OUT_ROWS = RECIPES_LEFT_OUT.map(([title, minutes]) => `${title} — minutes: ${minutes}`);
const RECIPES_TITLES = RECIPES_ANSWER.map(([title]) => title);
const RECIPES_REQUEST = "Open each recipe in the archive to see its card, then give me a table of the recipes ready in at most 20 minutes, with columns title and minutes.";
/** A yes naming only the answer's rows, settling the rest with one quote of the bound beside the condition. */
const RECIPES_YES = "Read s6 stores exactly Lemon Rice (15), Herb Omelette (10) and Cucumber Salad (5). Condition 1 (minutes atMost 20) left out the other six recipes, as the request asks for recipes \"ready in at most 20 minutes\".";

/** The run's summary before the judge's copy, the first read carrying Core's flag unless `flagged` is false. */
function recipesRunSummary(flagged = true): AutomationStudioRunResultSummary {
  const row = ([title, minutes]: readonly [string, string]) => ({ title, minutes });
  const listed = [RECIPES_LEFT_OUT[0]!, RECIPES_ANSWER[0]!, RECIPES_LEFT_OUT[1]!, RECIPES_LEFT_OUT[2]!, RECIPES_ANSWER[1]!, RECIPES_LEFT_OUT[3]!, RECIPES_LEFT_OUT[4]!, RECIPES_ANSWER[2]!, RECIPES_LEFT_OUT[5]!];
  const set = (datasetId: string, node: string, rows: ReadonlyArray<readonly [string, string]>) => ({
    datasetId, recordCount: rows.length, refusedCount: 0, truncated: false, columns: ["title", "minutes"], columnsWithheld: false,
    rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: rows.map(row),
    processing: { collected: rows.length, duplicates: 0, filteredOut: 0, cut: 0, kept: rows.length, passes: [{ node, pass: 1, rows: rows.length, newRows: rows.length }] }
  });
  const working = { rereadBy: RECIPES_ANSWER_READ, repeatedBy: ["node.recipes.quick.s5"], sameList: "items_edge_and_read_target" as const, said: "working rows" };
  return {
    schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 12, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 2,
    recordSets: [set("all-recipes-s3", RECIPES_SOURCE_READ, listed), set("quick-recipes-s6", RECIPES_ANSWER_READ, RECIPES_ANSWER)],
    reads: [
      { nodeId: RECIPES_SOURCE_READ, definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 9, kept: 9, paginates: false, dedupes: false, ...(flagged ? { workingRows: working } : {}) },
      {
        nodeId: RECIPES_ANSWER_READ, definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 9, kept: 3, paginates: false, dedupes: false,
        conditions: [{
          number: 1, condition: "minutes atMost 20", rejected: 6, alone: 6, leftOutOnlyByThis: [...RECIPES_LEFT_OUT_ROWS], leftOutSettled: [...RECIPES_LEFT_OUT_ROWS],
          settled: "Core read minutes on each row in leftOutSettled, and each fails condition 1 (minutes atMost 20) as written. It must still show the bound is the request's: quote, once, in a sentence that names condition 1 (minutes atMost 20) or minutes, the request's own words stating that bound."
        }]
      }
    ],
    flowShape: [
      { nodeId: "node.recipes.quick.s1", definitionId: "navigate" }, { nodeId: RECIPES_SOURCE_READ, definitionId: "extract_list" },
      { nodeId: "node.recipes.quick.s4", definitionId: "builtin.control.for-each" }, { nodeId: "node.recipes.quick.s5", definitionId: "click" },
      { nodeId: RECIPES_ANSWER_READ, definitionId: "extract_list" }
    ],
    withheld: false
  };
}

const recipesInstruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Quick recipes", body: RECIPES_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};
const recipesWording = (summary = recipesRunSummary()) => automationStudioRequestWording([recipesInstruction], summary)!;
const answerCondition = (summary: AutomationStudioRunResultSummary) =>
  automationStudioResultSummaryWithAlsoInResult(summary).reads!.find((read) => read.nodeId === RECIPES_ANSWER_READ)!.conditions![0]! as MarkedCondition;

describe("a later read's left-out rows that only working rows hold (t752)", () => {
  it("are not counted as the result, nor stored by another read", () => {
    const { reads, stored } = automationStudioRequestRowsReads(recipesRunSummary());
    expect(stored.map((row) => row.label)).toEqual(RECIPES_TITLES);
    const answer = reads.find((read) => read.nodeId === RECIPES_ANSWER_READ)!;
    expect(answer.inResult).toEqual(RECIPES_TITLES);
    expect(answer).not.toHaveProperty("storedElsewhere");
    expect(automationStudioRequestRowsStoredBy(recipesRunSummary())(RECIPES_ANSWER_READ, RECIPES_LEFT_OUT[0]![0])).toBeUndefined();
  });

  it("are never marked stored though left out, nor another copy of a kept row, on the judge's copy", () => {
    const condition = answerCondition(recipesRunSummary());
    expect(condition).not.toHaveProperty("storedThoughLeftOut");
    expect(condition).not.toHaveProperty("storedAnyway");
    expect(condition).not.toHaveProperty("leftOutAlsoInResult");
    // Without Core's flag the first read is a read like any other, and its rows are marked as before (t691).
    expect(answerCondition(recipesRunSummary(false)).storedThoughLeftOut).toEqual(RECIPES_LEFT_OUT_ROWS);
  });

  it("never hold a yes that names only the answer's rows and quotes the settled bound once", () => {
    expect(automationStudioResultLeftOutRowsUnquoted(recipesRunSummary(), RECIPES_YES, recipesWording())).toEqual([]);
    expect(automationStudioResultLeftOutRowsUnquoted(recipesRunSummary(false), RECIPES_YES, recipesWording(recipesRunSummary(false))))
      .toEqual([{ nodeId: RECIPES_ANSWER_READ, condition: "condition 1 (minutes atMost 20)", rows: RECIPES_LEFT_OUT_ROWS, stored: [RECIPES_SOURCE_READ] }]);
  });

  it("still owe the settled condition's one quote of its bound, as any left-out row's", () => {
    const unquoted = automationStudioResultLeftOutRowsUnquoted(recipesRunSummary(), "Read s6 stores exactly Lemon Rice, Herb Omelette and Cucumber Salad.", recipesWording());
    expect(unquoted).toEqual([{ nodeId: RECIPES_ANSWER_READ, condition: "condition 1 (minutes atMost 20)", rows: RECIPES_LEFT_OUT_ROWS, bound: true, boundKind: "bound" }]);
  });

  it("are never flagged as kept rows lacking an answer column", () => {
    const summary = recipesRunSummary();
    summary.recordSets[0]!.sampleRows![6] = { title: "Apple Pie", minutes: "" };
    expect(automationStudioResultKeptWithoutAskedColumn(summary)).toEqual([]);
    expect(automationStudioResultKeptWithoutAskedColumn({ ...summary, reads: summary.reads!.map(({ workingRows: _working, ...read }) => read) }))
      .toMatchObject([{ kind: "column", datasetId: "all-recipes-s3", missing: "minutes", rows: ["Apple Pie"] }]);
  });
});

describe("t691's loans with the act read flagged as working rows", () => {
  const flagged = () => {
    const summary = renewalsRunSummary();
    summary.reads![0]!.workingRows = { rereadBy: RENEWALS_LIST_READ, repeatedBy: ["node.loans.renew_overdue.s11"], sameList: "items_edge_and_read_target", said: "working rows" };
    return summary;
  };

  it("still mark the rows the last read stored though condition 1 left them out, naming the last read", () => {
    const condition = automationStudioResultSummaryWithAlsoInResult(flagged()).reads![0]!.conditions![0]! as MarkedCondition;
    expect(condition.storedThoughLeftOut).toEqual(RENEWALS_LEFT_OUT_ROWS);
    expect(condition.storedAnyway).toContain(`read ${RENEWALS_LIST_READ} stored them`);
  });

  it("still hold a yes that never names each beside that read (judge 0032's reply)", () => {
    expect(automationStudioResultLeftOutRowsUnquoted(flagged(), reply(RENEWALS_YES.diagnosis, RENEWALS_YES.summaryText), renewalsWording()))
      .toEqual([{ nodeId: RENEWALS_ACT_READ, condition: "condition 1 (daysOverdue atLeast 5)", rows: RENEWALS_LEFT_OUT_ROWS, stored: [RENEWALS_LIST_READ] }]);
  });
});
