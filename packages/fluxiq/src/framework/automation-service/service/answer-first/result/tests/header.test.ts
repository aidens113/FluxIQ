// The result header: the statement every request carries, worked out from the ledger each time.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstResultPort } from "../index.ts";
import { AISLE, ENDED, FREE, look, MOVED, page, ROW_A, seats, seatVersion, SEAT_REQUEST, step, UNDER_TEN } from "./support.ts";

describe("the result header", () => {
  it("states the output step, its version, rows, pages, columns and coverage, and the looks not in it", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    const version = seatVersion([FREE, AISLE, UNDER_TEN, ROW_A]);
    port.record([page(step(9), "c1", seats("A", 11), { place: "page=1", version, paging: MOVED }), page(step(9), "c2", seats("B", 5), { place: "page=2", version, paging: ENDED }), look("c7", seats("C", 12))]);
    expect(port.header()).toBe("Result: step 9 (v1: 4 conditions), 16 rows over 2 pages: page=1 (11), page=2 (5); columns seat, price, state; the list ended after page=2 (no next page). Looks not in it: call c7 (12 rows).");
  });

  it("holds no row of the result, only counts and ids", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("Q", 3), { place: "page=1" })]);
    expect(port.header()).not.toContain("Q1");
  });

  it("says so when the draft has no read step, and names every look that kept rows and counts the rest", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([look("c1", seats("A", 4)), look("c2", []), look("c3", seats("B", 2)), look("c4", [])]);
    expect(port.header()).toBe("Result: no rows: the draft has no read step yet. Looks not in it: call c1 (4 rows), call c3 (2 rows); 2 more looks kept no rows.");
  });

  it("says a new version has read no page yet", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 4), { place: "page=1" })]);
    port.record([{ kind: "step", step: step(9), version: seatVersion([FREE, AISLE]) }]);
    expect(port.header()).toBe("Result: step 9 (v2: 2 conditions), 0 rows: v2 has read no page yet; columns seat, price, state.");
  });

  it("says when the list moved on after the last page read, and when the first place is not among the pages", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("C", 4), { place: "page=3", paging: MOVED })]);
    expect(port.header()).toContain("the first place is not among them; the list moved on after page=3 and nothing after it was read");
  });

  it("says the columns are not certain where the reader was unsure, and names the step's own columns where none were named", () => {
    const unsure = automationStudioAnswerFirstResultPort("Copy the timetable with columns train and platform as the board shows it.");
    unsure.record([page(step(2), "c1", [{ train: "8:05", platform: "4" }], { place: "page=1" })]);
    expect(unsure.header()).toContain('columns not certain: the request names train, and perhaps one of "platform as the", "platform as", "platform"');
    const none = automationStudioAnswerFirstResultPort("Copy the free seats.");
    none.record([page(step(2), "c1", seats("A", 1), { place: "page=1" })]);
    expect(none.header()).toContain("columns as read: seat, price, state");
  });
});
