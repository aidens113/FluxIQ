// The change line: before → after, worked out from the two ledgers, naming every page that left.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstAnswerContractOf, automationStudioAnswerFirstResultApply, automationStudioAnswerFirstResultChangeLine, automationStudioAnswerFirstResultLedger, type AutomationStudioAnswerFirstResultEvent, type AutomationStudioAnswerFirstResultLedger } from "../index.ts";
import { AISLE, FREE, look, page, seats, seatVersion, SEAT_REQUEST, step } from "./support.ts";

const empty = () => automationStudioAnswerFirstResultLedger(automationStudioAnswerFirstAnswerContractOf(SEAT_REQUEST));
const after = (ledger: AutomationStudioAnswerFirstResultLedger, ...events: AutomationStudioAnswerFirstResultEvent[]) => events.reduce(automationStudioAnswerFirstResultApply, ledger);

describe("the change line", () => {
  it("is none where nothing changed, a look included", () => {
    const before = after(empty(), page(step(9), "c1", seats("A", 4), { place: "page=1" }));
    expect(automationStudioAnswerFirstResultChangeLine(before, before)).toBeUndefined();
    expect(automationStudioAnswerFirstResultChangeLine(before, after(before, look("c2", seats("B", 9))))).toBeUndefined();
  });

  it("names a new page and a page read again with both counts", () => {
    const before = after(empty(), page(step(9), "c1", seats("A", 12), { place: "page=1" }));
    const later = after(before, page(step(9), "c2", seats("B", 5), { place: "page=2" }), page(step(9), "c3", seats("A", 10), { place: "page=1" }));
    expect(automationStudioAnswerFirstResultChangeLine(before, later)).toBe("result 12 → 15 rows: step 9 read page=1 again (12 → 10); step 9 read page=2 (5).");
  });

  it("names the old version's pages that left and what the new version has read", () => {
    const before = after(empty(), page(step(9), "c1", seats("A", 12), { place: "page=1" }), page(step(9), "c2", seats("B", 5), { place: "page=2" }));
    const later = after(before, page(step(9), "c3", seats("A", 11), { place: "page=1", version: seatVersion([FREE, AISLE]) }));
    expect(automationStudioAnswerFirstResultChangeLine(before, later)).toBe("result 17 → 11 rows: step 9 is now v2; v1's page=1 (12), page=2 (5) left the result; v2 has read page=1 only.");
  });

  it("says when a later read step becomes the result, and what was the result before", () => {
    const before = after(empty(), page(step(4), "c1", seats("A", 6), { place: "page=1" }));
    const later = after(before, page(step(7), "c2", [{ train: "8:05" }], { version: seatVersion([], "list:timetable", { train: "departure" }) }));
    expect(automationStudioAnswerFirstResultChangeLine(before, later)).toBe("result 6 → 1 row: step 7 is a new read step and read unplaced read 1 (1); the result is now step 7's (it was step 4's).");
  });

  it("names the pages of a working read that left with its step", () => {
    const before = after(empty(), page(step(2), "c0", seats("S", 3), { version: seatVersion([], "list:screens") }), page(step(9), "c1", seats("A", 4), { place: "page=1" }));
    expect(automationStudioAnswerFirstResultChangeLine(before, after(before, { kind: "dropped", stepId: "s2" }))).toBe("result 4 → 4 rows: step 2 left the draft, and its unplaced read 1 (3) left its working read.");
  });
});
