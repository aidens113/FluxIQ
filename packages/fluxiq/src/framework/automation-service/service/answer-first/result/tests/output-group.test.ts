// The steps whose pages are the answer (`../output-group.ts`): read steps appending to one named output, as the saved
// Flow's run fills it. Generic seat-list fixtures (`./support.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstResultPort, type AutomationStudioAnswerFirstResultStepRef, type AutomationStudioAnswerFirstResultWrites } from "../index.ts";
import { AISLE, look, page, seats, seatVersion, SEAT_REQUEST, step } from "./support.ts";

const APPEND: AutomationStudioAnswerFirstResultWrites = { datasetId: "seats", append: true };
const START_OVER: AutomationStudioAnswerFirstResultWrites = { datasetId: "seats", append: false };
const writing = (position: number, writes: AutomationStudioAnswerFirstResultWrites, intermediate?: boolean): AutomationStudioAnswerFirstResultStepRef => ({ ...step(position, intermediate), writes });
const seatsOf = (port: ReturnType<typeof automationStudioAnswerFirstResultPort>) => port.answer().rows.map((row) => row.seat);
// Two reads of the same seat list asked another way: two steps, never folded into one (their conditions differ).
const aisle = seatVersion([AISLE], null);

describe("steps appending to one named output", () => {
  it("are one answer, in draft order, and the change line, header and look say so", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(writing(2, APPEND), "c1", seats("A", 2), { version: seatVersion(undefined, null) })]);
    const line = port.record([page(writing(4, APPEND), "c2", seats("B", 1), { version: aisle })]);
    expect(seatsOf(port)).toEqual(["A1", "A2", "B1"]);
    expect(port.outputGroup().map((each) => each.id)).toEqual(["s2", "s4"]);
    expect(port.outputStep()?.id).toBe("s4");
    expect(line).toBe("result 2 → 3 rows: step 4 is a new read step and read unplaced read 1 (1); the result is now step 2 then step 4's, each appending to one record output (it was step 2's).");
    expect(port.header()).toMatch(/^Result: step 2 \(v1: 1 condition\), 2 rows over 1 page: unplaced read 1 \(2\); then step 4 \(v1: 1 condition\), 1 row over 1 page: unplaced read 1 \(1\); each appending to one record output, 3 rows in all; columns seat, price, state/u);
    expect(port.header()).not.toContain("Working reads");
    expect(port.record([look("c3", seats("C", 5))])).toBe("a look: the result is unchanged (step 2 then step 4, 3 rows).");
    expect(port.emptyRefusal()).toBeUndefined();
  });

  it("reach back only to the last step that starts the output over", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(writing(1, APPEND), "c1", seats("A", 1), { version: seatVersion(undefined, null) })]);
    port.record([page(writing(2, START_OVER), "c2", seats("B", 1), { version: aisle })]);
    port.record([page(writing(3, APPEND), "c3", seats("C", 1), { version: seatVersion([], null) })]);
    expect(port.outputGroup().map((each) => each.id)).toEqual(["s2", "s3"]);
    expect(seatsOf(port)).toEqual(["B1", "C1"]);
    expect(port.header()).toContain("Working reads, not the answer: step 1 (1 page, 1 row)");
  });

  it("is the output step alone where it starts its output over, or names another", () => {
    const over = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    over.record([page(writing(1, APPEND), "c1", seats("A", 1), { version: seatVersion(undefined, null) }), page(writing(2, START_OVER), "c2", seats("B", 1), { version: aisle })]);
    expect(seatsOf(over)).toEqual(["B1"]);
    const other = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    other.record([page(writing(1, APPEND), "c1", seats("A", 1), { version: seatVersion(undefined, null) }), page(writing(2, { datasetId: "other", append: true }), "c2", seats("B", 1), { version: aisle })]);
    expect(seatsOf(other)).toEqual(["B1"]);
  });

  it("leave out a step marked intermediate, and a look is never one of them (D1)", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(writing(1, APPEND, true), "c1", seats("A", 1), { version: seatVersion(undefined, null) }), look("c2", seats("L", 3))]);
    port.record([page(writing(2, APPEND), "c3", seats("B", 1), { version: aisle })]);
    expect(seatsOf(port)).toEqual(["B1"]);
  });

  it("part when an amendment names another output, and the change line says the result changed", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(writing(1, APPEND), "c1", seats("A", 1), { version: seatVersion(undefined, null) }), page(writing(2, APPEND), "c2", seats("B", 1), { version: aisle })]);
    const line = port.record([{ kind: "step", step: writing(1, { datasetId: "other", append: true }), version: seatVersion(undefined, null) }]);
    expect(seatsOf(port)).toEqual(["B1"]);
    expect(line).toBe("result 2 → 1 row: the result is now step 2's (it was step 1 then step 2's, each appending to one record output).");
  });
});
