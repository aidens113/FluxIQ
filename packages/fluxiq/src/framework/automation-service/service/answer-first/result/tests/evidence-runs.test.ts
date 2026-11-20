// The shapes of the live runs the ledger was designed from (design (a) and (d) Phase 2), on generic fixtures. Each
// names the run whose failure it holds shut; none uses that run's site, task or rows.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioAnswerFirstResultPort, type AutomationStudioAnswerFirstResultVersion } from "../index.ts";
import { AISLE, ENDED, FREE, look, MOVED, page, ROW_A, seats, seatVersion, SEAT_REQUEST, step, UNDER_TEN } from "./support.ts";

/** A whole run of step 9: page 1 then page 2, which ends the list. */
function run(port: ReturnType<typeof automationStudioAnswerFirstResultPort>, first: number, second: number, version: AutomationStudioAnswerFirstResultVersion = seatVersion()) {
  return port.record([page(step(9), "b1", seats("A", first), { place: "page=1", paging: MOVED, version }), page(step(9), "b2", seats("B", second), { place: "page=2", paging: ENDED, version })]);
}

describe("the runs the ledger was built from", () => {
  it("run-mwafor01: a by-hand read of page 2 under four conditions, without add, is a look: the run's 17 stay, and it says so", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    run(port, 12, 5);
    const line = port.record([look("c40", seats("B", 5), { place: "page=2", version: seatVersion([FREE, AISLE, UNDER_TEN, ROW_A]) })]);
    expect(port.answer().rows).toHaveLength(17);
    expect(line).toBe("a look: the result is unchanged (step 9, 17 rows).");
  });

  it("run-mwaudvnh: look reads with no conditions leave the run's 16", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    run(port, 11, 5);
    port.record([look("c51", seats("A", 15), { version: seatVersion([]) })]);
    port.record([look("c52", seats("A", 27), { version: seatVersion([]) })]);
    expect(port.answer().rows).toHaveLength(16);
    expect(port.header()).toContain("16 rows over 2 pages");
    expect(port.header()).toContain("Looks not in it: call c51 (15 rows), call c52 (27 rows).");
  });

  it("run-mwa19obz: a short re-read of page 1 and then a whole run give the run's pages in place order", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c20", [{ seat: "A7" }, { seat: "A2" }, { seat: "A9" }, { seat: "A1" }], { place: "page=1" })]);
    run(port, 10, 10);
    expect(port.answer().rows.map((row) => row.seat)).toEqual([...seats("A", 10), ...seats("B", 10)].map((row) => row.seat));
  });

  it("run-mwbk0twg: after v2 and a run from step 1 in two passes, the header says 16 rows over 2 pages", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    run(port, 12, 5);
    const v2 = seatVersion([FREE, AISLE, UNDER_TEN, ROW_A]);
    expect(port.record([{ kind: "step", step: step(9), version: v2 }])).toBe("result 17 → 0 rows: step 9 is now v2; v1's page=1 (12), page=2 (5) left the result; v2 has read no page yet.");
    port.record([page(step(9), "b3", seats("A", 11), { place: "page=1", paging: MOVED, version: v2 })]);
    port.record([page(step(9), "b4", seats("B", 5), { place: "page=2", paging: ENDED, version: v2 })]);
    expect(port.header()).toBe("Result: step 9 (v2: 4 conditions), 16 rows over 2 pages: page=1 (11), page=2 (5); columns seat, price, state; the list ended after page=2 (no next page).");
  });

  it("Saturday (run-mwc6ut8u): three weeks read by three steps on three handles of one list give one step's 3 pages", () => {
    const port = automationStudioAnswerFirstResultPort("Find every open slot with columns day, time and state.");
    const grid: AutomationStudioAnswerFirstResultVersion = { conditions: [{ field: "state", op: "equals", value: "open" }], fields: { day: "day heading", time: "slot time", state: "slot state" }, listKey: "list:timetable-grid" };
    const week = (number: number): JsonObject[] => Array.from({ length: 7 }, (_, index) => ({ day: `week ${number} day ${index + 1}`, time: "10:00", state: "open" }));
    for (const [position, number] of [[5, 1], [7, 2], [9, 3]] as const) {
      port.record([page({ id: `handle-${number}`, position }, `c${position}`, week(number), { version: grid })]);
    }
    expect(port.ledger().steps).toHaveLength(1);
    expect(port.outputStep()?.pages).toHaveLength(3);
    expect(port.answer().rows.map((row) => row.day)).toEqual([...week(1), ...week(2), ...week(3)].map((row) => row.day));
    expect(port.header()).toContain("21 rows over 3 pages");
  });

  it("run-mwb2kkv5: a column the request did not name is not in the contract or the answer", () => {
    const port = automationStudioAnswerFirstResultPort("Copy the timetable with columns train, departs and platform.");
    const version: AutomationStudioAnswerFirstResultVersion = { conditions: [], fields: { train: "train", departs: "departure", platform: "platform", link: "detail address" }, listKey: "list:timetable" };
    port.record([page(step(3), "c1", [{ train: "IC 12", departs: "8:05", platform: "4", link: "detail-12" }], { place: "page=1", version })]);
    expect(port.ledger().contract.columns).not.toContain("link");
    expect(port.answer()).toEqual({ rows: [{ train: "IC 12", departs: "8:05", platform: "4" }], columns: ["train", "departs", "platform"], unmatched: [] });
  });
});
