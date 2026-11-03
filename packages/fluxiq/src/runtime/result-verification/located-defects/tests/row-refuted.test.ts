// A defect row Core's own record of that row refutes is never located, and is
// listed as refuted with its quote (t810, `../row-refuted.ts`): an item the
// client marked outside the person's set, called missing by first-person words
// that negate nothing; or a row whose own cell in the named column neither is,
// holds nor is held by the value claimed. On the made-up reading-circle board
// of `./circle-board-fixture.ts`. No model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmVerificationDefect } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultDefectsLocated } from "../index.ts";
import { ANY_CIRCLE, CIRCLE_REQUEST, NOT_ENTERED, OWN_CIRCLES, OWN_NOTE, REFUTED_DEFECTS, circleInstruction, circleRunSummary } from "./circle-board-fixture.ts";

function located(defects: readonly AutomationStudioLlmVerificationDefect[], summary: AutomationStudioRunResultSummary = circleRunSummary()) {
  const wording = automationStudioRequestWording([circleInstruction()], summary);
  const record = automationStudioResultNoRecord({ summary, requestText: CIRCLE_REQUEST, wording });
  return automationStudioResultDefectsLocated(defects, { record, summary, requestText: CIRCLE_REQUEST });
}

const marked = (requestWords: string): AutomationStudioLlmVerificationDefect => ({ kind: "asked_missing", row: "Kai Moss", column: "circle", value: "Garden Readers", requestWords });

describe("a defect row Core's record of that row refutes (t810)", () => {
  it("refutes every row of the case's no: two marked items by their marks, the member's own note by its own cell, found by its date", () => {
    const found = located(REFUTED_DEFECTS.map((defect) => ({ ...defect })));
    expect(found.located).toEqual([]);
    expect((found.refuted ?? []).map((one) => [one.defect.row.split(" — ")[0], one.evidence, one.quote])).toEqual([
      ["Ann Lee", "cell_differs", "circle: \"Ann Lee\""],
      ["Kai Moss", "outside_mark", "\"Reserve a place\" for \"Garden Readers\""],
      ["Rui Tan", "outside_mark", "\"Reserve a place\" for \"Cycle Readers\""]
    ]);
    expect(found.findings).toHaveLength(3);
    expect(found.findings[0]).toContain("holds \"Ann Lee\" in \"circle\", not \"Town Archive Society\"");
    expect(found.findings[1]).toContain("showed the person \"Reserve a place\" for \"Garden Readers\", an offer to enter a set the person is not in");
  });

  // Where the mark refutes nothing, the row is weighed as before: its own cell says the circle, so it is located.
  it("does not refute by a mark where the quoted words negate (the guard)", () => {
    const found = located([marked(NOT_ENTERED)]);
    expect(found.refuted).toBeUndefined();
    expect(found.located).toHaveLength(1);
  });

  it("does not refute by a mark where the quoted words name no person (the guard)", () => {
    const found = located([marked(ANY_CIRCLE)]);
    expect(found.refuted).toBeUndefined();
    expect(found.located).toHaveLength(1);
  });

  it("does not refute by a mark the client did not send: the row is weighed as before", () => {
    const found = located([marked(OWN_CIRCLES)], circleRunSummary({ marks: false }));
    expect(found.refuted).toBeUndefined();
    expect(found.located).toHaveLength(1);
  });

  it("does not refute a row where any of its records lacks the mark", () => {
    const summary = circleRunSummary();
    const condition = summary.reads![0]!.conditions![0]!;
    condition.leftOutOnlyByThis = [...condition.leftOutOnlyByThis!, "Kai Moss"];
    condition.leftOutCells = [...condition.leftOutCells!, { ...condition.leftOutCells![1]! }];
    condition.leftOutMarks = [...condition.leftOutMarks!, null];
    condition.alone = 5;
    expect(located([marked(OWN_CIRCLES)], summary).refuted).toBeUndefined();
  });

  // A second read account of the same item that sent no marks at all (follow-up 2): the same item, by its cells, does not block; another item may.
  function secondRead(cells: Record<string, string>): AutomationStudioRunResultSummary {
    const summary = circleRunSummary();
    const first = summary.reads![0]!;
    summary.reads!.push({ ...first, nodeId: "read-board-again", conditions: [{ number: 1, condition: first.conditions![0]!.condition!, rejected: 1, alone: 1, leftOutOnlyByThis: ["Kai Moss"], leftOutCells: [cells] }] });
    return summary;
  }

  it("refutes by the mark where another read of the same item, by its cells, sent no marks", () => {
    const summary = circleRunSummary();
    const same = { ...summary.reads![0]!.conditions![0]!.leftOutCells![1]! };
    expect((located([marked(OWN_CIRCLES)], secondRead(same)).refuted ?? []).map((one) => one.evidence)).toEqual(["outside_mark"]);
  });

  it("does not refute where an unmarked record of that label may be another item", () => {
    const summary = circleRunSummary();
    const other = { ...summary.reads![0]!.conditions![0]!.leftOutCells![1]!, posted: "Friday 5 March 2027 at 08:00" };
    expect(located([marked(OWN_CIRCLES)], secondRead(other)).refuted).toBeUndefined();
  });

  it("does not refute by a cell that holds the value, is held by it, or is empty", () => {
    const named = (value: string): AutomationStudioLlmVerificationDefect => ({ kind: "asked_missing", row: "Ann Lee", column: "circle", value, requestWords: ANY_CIRCLE });
    expect(located([named("Ann Lee")]).refuted).toBeUndefined();
    expect(located([named("Ann")]).refuted).toBeUndefined();
    expect(located([named("Ann Lee's circle")]).refuted).toBeUndefined();
    const summary = circleRunSummary();
    summary.reads![0]!.conditions![0]!.leftOutCells = [{ ...OWN_NOTE, circle: "" }, summary.reads![0]!.conditions![0]!.leftOutCells![1]!, summary.reads![0]!.conditions![0]!.leftOutCells![2]!, { ...OWN_NOTE, circle: "" }];
    expect(located([named("Town Archive Society")], summary).refuted).toBeUndefined();
  });

  it("refutes a kept row by its own stored cell, and locates it where the cell agrees", () => {
    const kept = (value: string): AutomationStudioLlmVerificationDefect => ({ kind: "kept_not_asked", row: "Map Readers", column: "author", value, requestWords: OWN_CIRCLES });
    expect(located([kept("Ann Lee")]).refuted).toEqual([expect.objectContaining({ evidence: "cell_differs", quote: "author: \"Eli Park\"" })]);
    expect(located([kept("Eli Park")]).refuted).toBeUndefined();
  });

  it("refutes a claim about a kept row that names only a row a read left out, quoting the condition that left it out (not_kept)", () => {
    const found = located([
      { kind: "wrong_value", row: "Ann Lee — Wednesday 3 March 2027 at 09:15", column: "circle", value: "Ann Lee", requestWords: ANY_CIRCLE },
      { kind: "kept_not_asked", row: "Kai Moss", requestWords: ANY_CIRCLE }
    ]);
    expect(found.located).toEqual([]);
    expect((found.refuted ?? []).map((one) => [one.defect.kind, one.evidence, one.quote])).toEqual([
      ["wrong_value", "not_kept", "left out by condition 1 (access startsWith [\"For members of\"])"],
      ["kept_not_asked", "not_kept", "left out by condition 1 (access startsWith [\"For members of\"])"]
    ]);
    expect(found.findings[0]).toContain("is no row the result holds: a read saw it, and it was left out, by condition 1");
  });

  it("never refutes a wrong value of a stored row by its row, or an unmeasurable requirement", () => {
    const found = located([
      { kind: "wrong_value", row: "Map Readers", column: "author", value: "Ann Lee", requestWords: ANY_CIRCLE },
      { kind: "other", row: "order of the table", requestWords: ANY_CIRCLE }
    ]);
    expect(found.refuted).toBeUndefined();
  });
});
