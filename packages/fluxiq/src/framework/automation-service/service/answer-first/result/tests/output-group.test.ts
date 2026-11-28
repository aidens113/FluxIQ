// The steps whose pages are the answer (`../output-group.ts`): read steps appending to one named output, as the saved
// Flow's run fills it. Generic seat-list fixtures (`./support.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstResultPort, type AutomationStudioAnswerFirstResultStepRef, type AutomationStudioAnswerFirstResultWrites } from "../index.ts";
import { AISLE, FREE, look, page, seats, seatVersion, SEAT_REQUEST, step } from "./support.ts";

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

// Every result read of one list is the answer (t1091). The provider-free kestrel harness (t1082, attempt 2): the carried
// step 6 read page 2 of the list and step 12, a new extraction of the same list, read page 1; the answer was step 12's
// page alone, nine rows where ten were right. The reads differ in their fields, so they are two steps, never folded (D2).
describe("result reads of one list", () => {
  const LIST = "list:cinema-seats";
  const whole = seatVersion([], LIST, { seat: "seat label", price: "price text", state: "seat state" });
  const narrow = seatVersion([], LIST, { seat: "seat label", price: "price text" });
  // One search of the list: its pages share this address, which leaves out only what turns the page.
  const SHOW = "https://cinema.example/seats?show=7";
  const pageTwo = () => page(step(6), "c6", seats("B", 3), { version: whole, place: "page=2", where: SHOW });
  const pageOne = () => page(step(12), "c12", seats("A", 2).map(({ seat, price }) => ({ seat: seat!, price: price! })), { version: narrow, place: "page=1", where: SHOW });

  it("answer from every one, whatever extraction each used, and the header and change line name them all", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([pageTwo()]);
    const line = port.record([pageOne()]);
    expect(port.outputGroup().map((each) => each.id)).toEqual(["s6", "s12"]);
    expect(seatsOf(port)).toEqual(["B1", "B2", "B3", "A1", "A2"]);
    expect(line).toBe("result 3 → 5 rows: step 12 is a new read step and read page=1 (2); the result is now step 6 then step 12's, each a result read of the same list (it was step 6's).");
    expect(port.header()).toMatch(/^Result: step 6 \(v1: no conditions\), 3 rows over 1 page: page=2 \(3\); then step 12 \(v1: no conditions\), 2 rows over 1 page: page=1 \(2\); each a result read of the same list, 5 rows in all; columns seat, price, state/u);
    expect(port.header()).not.toContain("Working reads");
    // What was read of the list is said once, from both steps' pages: page=1 is among them, page=2 is the last.
    expect(port.header()).toContain("columns seat, price, state; paging after page=2 not yet checked.");
    expect(port.header()).not.toContain("the first place is not among them");
  });

  it("leave out a read marked intermediate, a read of another list, and a read whose list was not said", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(2, true), "c2", seats("W", 1), { version: seatVersion([FREE], LIST, { seat: "seat label", price: "price text", state: "seat state" }), place: "page=3" })]);
    port.record([page(step(4), "c4", seats("O", 1), { version: seatVersion([], "list:screens") })]);
    port.record([page(step(5), "c5", seats("U", 1), { version: seatVersion([], null, { seat: "seat label" }) })]);
    port.record([pageTwo(), pageOne()]);
    expect(port.outputGroup().map((each) => each.id)).toEqual(["s6", "s12"]);
    expect(port.header()).toContain("Working reads, not the answer: step 2 (1 page, 1 row), step 4 (1 page, 1 row), step 5 (1 page, 1 row).");
  });

  it("leave out a read of the list that the output the answer fills started over", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(writing(6, START_OVER), "c6", seats("B", 3), { version: whole, place: "page=2", where: SHOW })]);
    port.record([page(writing(12, START_OVER), "c12", seats("A", 2), { version: narrow, place: "page=1", where: SHOW })]);
    expect(seatsOf(port)).toEqual(["A1", "A2"]);
    const other = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    other.record([page(writing(6, { datasetId: "pages", append: false }), "c6", seats("B", 3), { version: whole, place: "page=2", where: SHOW })]);
    other.record([page(writing(12, START_OVER), "c12", seats("A", 2), { version: narrow, place: "page=1", where: SHOW })]);
    expect(seatsOf(other)).toEqual(["B1", "B2", "B3", "A1", "A2"]);
  });

  // The bigbox shape: read the list, sort it through the site, read it again. The sort is a new address of the list, so
  // the first read was under a state the second superseded, and only the sorted read is the answer.
  it("leave out a read taken under an earlier state of the list: another filter, sort or search", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(3), "c3", seats("U", 4), { version: whole, place: "page=1", where: SHOW })]);
    const line = port.record([page(step(5), "c5", seats("S", 3).map(({ seat, price }) => ({ seat: seat!, price: price! })), { version: narrow, place: "page=1", where: `${SHOW}&sort=price` })]);
    expect(port.outputGroup().map((each) => each.id)).toEqual(["s5"]);
    expect(seatsOf(port)).toEqual(["S1", "S2", "S3"]);
    expect(line).toBe("result 4 → 3 rows: step 5 is a new read step and read page=1 (3); the result is now step 5's (it was step 3's).");
    expect(port.header()).toContain("Working reads, not the answer: step 3 (1 page, 4 rows).");
  });

  it("fall back to the output step's own pages where no address was recorded", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(6), "c6", seats("B", 3), { version: whole, place: "page=2" }), page(step(12), "c12", seats("A", 2), { version: narrow, place: "page=1" })]);
    expect(seatsOf(port)).toEqual(["A1", "A2"]);
    const half = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    half.record([page(step(6), "c6", seats("B", 3), { version: whole, place: "page=2" }), page(step(12), "c12", seats("A", 2), { version: narrow, place: "page=1", where: SHOW })]);
    expect(seatsOf(half)).toEqual(["A1", "A2"]);
  });
});
