// One case per operation of the result ledger (design (b)1's table), each through the port the wiring will feed.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstResultPlaceLabels, automationStudioAnswerFirstResultPort } from "../index.ts";
import { AISLE, ENDED, FREE, look, MOVED, page, seats, seatVersion, SEAT_LIST, SEAT_REQUEST, step } from "./support.ts";

const labels = (port: ReturnType<typeof automationStudioAnswerFirstResultPort>) => automationStudioAnswerFirstResultPlaceLabels(port.outputStep()?.pages ?? []);

describe("a draft read step's page", () => {
  it("is set at its place, and stands in numbered order whatever order it was read in", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c2", seats("B", 5), { place: "page=2" }), page(step(9), "c1", seats("A", 12), { place: "page=1" })]);
    expect(labels(port)).toEqual(["page=1", "page=2"]);
    expect(port.answer().rows.map((row) => row.seat)).toEqual([...seats("A", 12), ...seats("B", 5)].map((row) => row.seat));
  });

  it("replaces the page at a place read again, and never adds it beside", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 12), { place: "page=1" }), page(step(9), "c2", seats("B", 5), { place: "page=2" })]);
    const line = port.record([page(step(9), "c3", seats("A", 11), { place: "page=1" })]);
    expect(port.answer().rows).toHaveLength(16);
    expect(labels(port)).toEqual(["page=1", "page=2"]);
    expect(line).toBe("result 17 → 16 rows: step 9 read page=1 again (12 → 11).");
  });

  it("with no place said is the next after the version's last place", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 4), { place: "page=1" }), page(step(9), "c2", seats("B", 4)), page(step(9), "c3", seats("C", 4))]);
    expect(labels(port)).toEqual(["page=1", "unplaced read 1", "unplaced read 2"]);
    expect(port.answer().rows).toHaveLength(12);
  });

  it("holds only what the read kept: its left-out rows are evidence, never rows (D3)", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    const event = page(step(9), "c1", seats("A", 3), { place: "page=1" });
    if (event.kind !== "page") throw new Error("a page event");
    event.read.leftOut = { where: [FREE], sets: [{ kind: "alone", conditions: [0], rows: [{ seat: "A9", state: "taken" }] }] };
    port.record([event]);
    expect(port.answer().rows.map((row) => row.seat)).toEqual(["A1", "A2", "A3"]);
    expect(port.outputStep()?.pages[0]?.leftOut?.sets[0]?.rows).toEqual([{ seat: "A9", state: "taken" }]);
    expect(port.header()).toContain("3 rows over 1 page");
  });
});

describe("a new step reading the same list the same way (D2)", () => {
  it("folds into the existing step, and the change line says so", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 12), { place: "page=1" })]);
    const line = port.record([page(step(12), "c2", seats("B", 5), { place: "page=2" })]);
    expect(port.ledger().steps).toHaveLength(1);
    expect(port.answer().rows).toHaveLength(17);
    expect(line).toBe("result 12 → 17 rows: step 9 (also step 12, the same list read the same way) read page=2 (5); step 12 reads the same list as step 9 with the same conditions and fields, so its pages are step 9's.");
  });

  it("does not fold a step whose list was not said, or whose list, conditions or fields differ", () => {
    for (const other of [seatVersion([FREE], null), seatVersion([FREE], "list:another"), seatVersion([FREE, AISLE]), seatVersion([FREE], SEAT_LIST, { seat: "seat label" })]) {
      const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
      port.record([page(step(9), "c1", seats("A", 12), { place: "page=1" }), page(step(12), "c2", seats("B", 5), { place: "page=2", version: other })]);
      expect(port.ledger().steps).toHaveLength(2);
      expect(port.answer().rows).toHaveLength(5);
    }
  });

  it("folds a step added before its list was said, once its first page says it", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 12), { place: "page=1" })]);
    port.record([{ kind: "step", step: step(12), version: seatVersion([FREE], null) }]);
    port.record([page(step(12), "c2", seats("B", 5), { place: "page=2" })]);
    expect(port.ledger().steps).toHaveLength(1);
    expect(port.answer().rows).toHaveLength(17);
  });
});

describe("a step's version changes", () => {
  it("drops the old version's pages and names them, and says what the new version has read", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 12), { place: "page=1", paging: MOVED }), page(step(9), "c2", seats("B", 5), { place: "page=2", paging: ENDED })]);
    const line = port.record([page(step(9), "c3", seats("A", 11), { place: "page=1", version: seatVersion([FREE, AISLE]) })]);
    expect(line).toBe("result 17 → 11 rows: step 9 is now v2; v1's page=1 (12), page=2 (5) left the result; v2 has read page=1 only.");
    expect(port.answer().rows).toHaveLength(11);
    expect(port.outputStep()?.version).toBe(2);
  });

  it("by an amendment alone leaves the step with no page until it reads again", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 12), { place: "page=1" })]);
    const line = port.record([{ kind: "step", step: step(9), version: seatVersion([FREE, AISLE], null) }]);
    expect(line).toBe("result 12 → 0 rows: step 9 is now v2; v1's page=1 (12) left the result; v2 has read no page yet.");
  });

  it("does not change when only the list key is said for the first time", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([{ kind: "step", step: step(9), version: seatVersion([FREE], null) }]);
    port.record([page(step(9), "c1", seats("A", 4), { place: "page=1" })]);
    expect(port.outputStep()?.version).toBe(1);
    expect(port.outputStep()?.reads.listKey).toBe("list:cinema-seats");
  });
});

describe("a read step is dropped from the draft", () => {
  it("takes its pages out of the result, announced", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(3, true), "c0", seats("Z", 2), { version: seatVersion([], "list:screens") }), page(step(9), "c1", seats("A", 12), { place: "page=1" })]);
    const line = port.record([{ kind: "dropped", stepId: "s9" }]);
    expect(line).toBe("result 12 → 0 rows: step 9 left the draft, and its page=1 (12) left the result; no read step is the result now.");
    expect(port.answer().rows).toEqual([]);
  });

  it("leaves the pages with a step folded into it, which then holds them", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 12), { place: "page=1" }), page(step(12), "c2", seats("B", 5), { place: "page=2" })]);
    port.record([{ kind: "dropped", stepId: "s9" }]);
    expect(port.outputStep()?.id).toBe("s12");
    expect(port.outputStep()?.position).toBe(11);
    expect(port.answer().rows).toHaveLength(17);
  });
});

describe("a read that is not a draft step (a look)", () => {
  it("is recorded and never changes the result, and its answer says so", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 12), { place: "page=1" })]);
    const line = port.record([look("c2", seats("B", 30), { place: "page=1" })]);
    expect(line).toBe("a look: the result is unchanged (step 9, 12 rows).");
    expect(port.answer().rows).toHaveLength(12);
    expect(port.ledger().looks.map((each) => each.source)).toEqual(["c2"]);
  });
});

describe("take", () => {
  it("makes a look a draft step with its page, and it is no longer a look", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([look("c4", seats("A", 6), { place: "page=1" })]);
    const line = port.record([{ kind: "take", source: "c4", step: step(5) }]);
    expect(line).toBe("result 0 → 6 rows: call c4 is now a draft step (step 5); step 5 is a new read step and read page=1 (6); the result is now step 5's.");
    expect(port.ledger().looks).toEqual([]);
    expect(port.answer().rows).toHaveLength(6);
  });

  it("of a call that is not a look takes nothing, and says so", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 12), { place: "page=1" })]);
    expect(port.record([{ kind: "take", source: "c1", step: step(10) }])).toBe("call c1 is not a read outside the draft, so nothing was taken.");
    expect(port.ledger().steps).toHaveLength(1);
  });
});

describe("a later attempt's carry-on", () => {
  it("marks its pages carried, and a read of the place in this attempt replaces them", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "k1", seats("A", 12), { place: "page=1", carried: true })]);
    expect(port.header()).toContain("page=1 (12, carried from an earlier attempt)");
    port.record([page(step(9), "c1", seats("A", 12), { place: "page=1" })]);
    expect(port.outputStep()?.pages.map((each) => each.carried)).toEqual([false]);
    expect(port.header()).not.toContain("carried");
  });
});

describe("what the pager said after a page", () => {
  it("is set on the step's most recently read page", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c2", seats("B", 5), { place: "page=2" }), page(step(9), "c1", seats("A", 12), { place: "page=1" })]);
    port.record([{ kind: "paging", stepId: "s9", paging: MOVED }]);
    expect(port.outputStep()?.pages.map((each) => each.paging)).toEqual([MOVED, undefined]);
  });
});

describe("the output step", () => {
  it("is the last read step not marked intermediate; earlier reads are working reads", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([
      page(step(2), "c0", seats("S", 3), { version: seatVersion([], "list:screens") }),
      page(step(9), "c1", seats("A", 12), { place: "page=1" }),
      page(step(11, true), "c9", seats("T", 1), { version: seatVersion([], "list:totals") }),
    ]);
    expect(port.outputStep()?.position).toBe(9);
    expect(port.header()).toContain("Working reads, not the answer: step 2 (1 page, 3 rows), step 11 (1 page, 1 row).");
  });
});

describe("a draft that never assembles", () => {
  it("still has a result: nothing the ledger reads is the assembled Flow", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([{ kind: "step", step: step(4), version: seatVersion() }, page(step(4), "c1", seats("A", 3), { place: "page=1" })]);
    expect(port.answer().rows).toHaveLength(3);
    expect(port.emptyRefusal()).toBeUndefined();
  });
});
