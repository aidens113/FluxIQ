// Coverage per step version: the places read, whether the first is among them, and what the pager said after the last.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstResultCoverage, automationStudioAnswerFirstResultPort } from "../index.ts";
import { ENDED, MOVED, page, seats, SEAT_REQUEST, step } from "./support.ts";

function coverageAfter(...events: Parameters<ReturnType<typeof automationStudioAnswerFirstResultPort>["record"]>[0]) {
  const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
  port.record(events);
  return automationStudioAnswerFirstResultCoverage(port.outputStep()!);
}

describe("coverage", () => {
  it("names the places read in order, the first read, and the list ended after the last with its reason", () => {
    expect(coverageAfter(page(step(9), "c2", seats("B", 5), { place: "page=2", paging: ENDED }), page(step(9), "c1", seats("A", 12), { place: "page=1", paging: MOVED }))).toEqual({
      places: ["page=1", "page=2"],
      first: "read",
      last: { place: "page=2", paging: ENDED },
    });
  });

  it("counts a zero-based first place as the first", () => {
    expect(coverageAfter(page(step(9), "c1", seats("A", 20), { place: "offset=0" })).first).toBe("read");
  });

  it("says the first place was not read where the lowest numbered place is past it, and the list moved on", () => {
    expect(coverageAfter(page(step(9), "c1", seats("A", 5), { place: "page=2", paging: MOVED }))).toEqual({ places: ["page=2"], first: "not read", last: { place: "page=2", paging: MOVED } });
  });

  it("does not know about the first place where no place was numbered, and says nothing of paging that was not said", () => {
    expect(coverageAfter(page(step(9), "c1", seats("A", 5)), page(step(9), "c2", seats("B", 5), { place: "cursor=x7" }))).toEqual({
      places: ["unplaced read 1", "cursor=x7"],
      first: "unknown",
      last: { place: "cursor=x7", paging: undefined },
    });
  });
});
