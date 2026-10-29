// The left-out fact (framework plan P5, debug of `run-mvtdoyf3-47ffaac1`, F1):
// where the request asks for every result, every row a read left out, alone or
// by several conditions together, falls under an exclusion the request itself
// states, or Core says no. A library catalog (`../../request-rows/tests/library-catalog/tests/wall-calendar-fixture.ts`).
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultComputedFactsInput, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import {
  WALL_CALENDAR_KEPT, WALL_CALENDAR_REFERENCE, WALL_CALENDAR_REQUEST, WALL_CALENDAR_REQUEST_KIND, WALL_CALENDAR_REQUEST_STATED, WALL_CALENDAR_ROW,
  wallCalendarRunSummary
} from "../../request-rows/tests/library-catalog/tests/wall-calendar-fixture.ts";
import { automationStudioResultLeftOutAccountedFact } from "../left-out-accounted.ts";

/** The every-result clause of `WALL_CALENDAR_REQUEST`, as the request writes it. */
const CLAUSE = "list every result on the first page";

function input(summary: AutomationStudioRunResultSummary, requestText: string): AutomationStudioResultComputedFactsInput {
  return { summary, instructions: [{ title: "List the catalog", body: requestText }], requestText: `List the catalog\n${requestText}` };
}

/** The run with condition 1 alone, the together set taken out. */
function referenceOnly(): AutomationStudioRunResultSummary {
  const summary = wallCalendarRunSummary();
  const { leftOutTogether: _together, ...read } = summary.reads![0]!;
  return { ...summary, reads: [{ ...read, conditions: [read.conditions![0]!] }] };
}

/** The run with one presence condition the request never states, `isbn is present`, leaving out one row said with its empty cell. */
function isbnPresent(): AutomationStudioRunResultSummary {
  const summary = referenceOnly();
  const [read] = summary.reads!;
  return { ...summary, reads: [{ ...read!, conditions: [...read!.conditions!, {
    number: 2, condition: "isbn is present", rejected: 1, alone: 1, leftOutOnlyByThis: ["Garden Notes Journal — isbn: (no value)"],
    leftOutSettled: ["Garden Notes Journal — isbn: (no value)"], settledKind: "presence"
  }] }] };
}

describe("every row a read left out, under an exclusion the request states (F1)", () => {
  it("fails for rows conditions left out together that the request never states, one defect per row", () => {
    const facts = automationStudioResultLeftOutAccountedFact(input(wallCalendarRunSummary(), WALL_CALENDAR_REQUEST));
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      kind: "left_out_accounted", status: "fails",
      defects: [{ kind: "asked_missing", row: WALL_CALENDAR_ROW, column: "title", requestWords: CLAUSE }]
    });
    expect(facts[0]!.said).toContain(WALL_CALENDAR_ROW);
    expect(facts[0]!.said).toContain(`"${CLAUSE}"`);
    // Generic words only: nothing of any one site.
    expect(facts[0]!.said).not.toMatch(/earbud|store|sponsor/iu);
  });

  it("holds where the request states the exclusion of a presence condition, by Core's read of the row", () => {
    const facts = automationStudioResultLeftOutAccountedFact(input(referenceOnly(), WALL_CALENDAR_REQUEST));
    expect(facts).toEqual([expect.objectContaining({ kind: "left_out_accounted", status: "holds" })]);
    expect(facts[0]!.defects).toBeUndefined();
    expect(facts[0]!.said).toContain("\"reference\"");
  });

  it("holds the together rows where the request states one of their conditions", () => {
    const facts = automationStudioResultLeftOutAccountedFact(input(wallCalendarRunSummary(), WALL_CALENDAR_REQUEST_STATED));
    expect(facts).toEqual([expect.objectContaining({ status: "holds" })]);
  });

  it("fails for a presence condition the request never states, with the tested column", () => {
    const facts = automationStudioResultLeftOutAccountedFact(input(isbnPresent(), WALL_CALENDAR_REQUEST));
    expect(facts).toEqual([expect.objectContaining({
      status: "fails",
      defects: [{ kind: "asked_missing", row: "Garden Notes Journal", column: "isbn", requestWords: CLAUSE }]
    })]);
  });

  it("says nothing of a request for a kind of thing: the judge decides it, as before", () => {
    expect(automationStudioResultLeftOutAccountedFact(input(wallCalendarRunSummary(), WALL_CALENDAR_REQUEST_KIND))).toEqual([]);
    expect(automationStudioResultLeftOutAccountedFact(input(isbnPresent(), "Find garden gloves"))).toEqual([]);
  });

  it("says nothing where it cannot decide a condition: the request says its words, but not as an exclusion", () => {
    const including = "Search the catalog for garden books and list every result on the first page, including reference copies.";
    expect(automationStudioResultLeftOutAccountedFact(input(referenceOnly(), including))).toEqual([]);
  });

  it("says nothing of a build test's read, whose conditions are named by their field alone", () => {
    const summary = {
      ...wallCalendarRunSummary(), reads: [], recordSets: [],
      buildTest: { kind: "build_test", test: "ran", steps: [{ step: 2, action: "extract_list", outcome: "replayed", observed: { readRows: {
        rows: WALL_CALENDAR_KEPT,
        leftOutOnlyByThis: [{ number: 1, condition: "reference", rows: [WALL_CALENDAR_REFERENCE] }],
        leftOutTogether: [{ numbers: [2, 3], conditions: ["title", "format"], rows: [WALL_CALENDAR_ROW] }]
      } } }] }
    } as unknown as AutomationStudioRunResultSummary;
    expect(automationStudioResultLeftOutAccountedFact(input(summary, WALL_CALENDAR_REQUEST))).toEqual([]);
  });

  it("never holds a left-out row whose label is also a row of the result against the request", () => {
    const summary = referenceOnly();
    const [read] = summary.reads!;
    const copy = { ...summary, reads: [{ ...read!, conditions: [...read!.conditions!, { number: 2, condition: "format not contains [\"Large Print\"]", rejected: 1, alone: 1, leftOutOnlyByThis: [WALL_CALENDAR_KEPT[0]!] }] }] };
    expect(automationStudioResultLeftOutAccountedFact(input(copy, WALL_CALENDAR_REQUEST))).toEqual([expect.objectContaining({ status: "holds" })]);
  });
});
