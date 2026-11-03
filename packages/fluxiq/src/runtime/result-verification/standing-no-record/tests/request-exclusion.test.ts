// Core's record of a condition written in the request's own exclusion words
// (t687, `../request-exclusion.ts`): A8 cost round `run-mvblov2i-abb7d82e`
// revision 1, where a presence condition left out rows the request says to
// leave out and Core could not account for every row it left out. Replayed on
// a venue's show listings (`./shows-fixture.ts`).
import { describe, expect, it } from "vitest";
import { LEAVE_OUT, INCLUDING, MARKED, UNREAD, showsStandingNo } from "./shows-fixture.ts";

const first = (record: ReturnType<typeof showsStandingNo>) => record.conditions.find((condition) => condition.number === 1)!;

describe("a condition that leaves rows out by what the request says to leave out (t687)", () => {
  it("carries the request's words though Core cannot account for every row it left out", () => {
    const condition = first(showsStandingNo());
    // The two shows whose value Core never read leave it without `keptOut` (t641)...
    expect(condition.keptOut).toBeUndefined();
    expect(condition.leftOutAlone).toEqual([MARKED, ...UNREAD]);
    // ...but Core read on the marked one what the request says to leave out.
    expect(condition.excludes).toEqual(["sold out"]);
    expect(condition.askedFor).toBeUndefined();
  });

  it("reads a negated text test the same way", () => {
    const condition = first(showsStandingNo(LEAVE_OUT, { wording: "status not contains \"Sold out\"" }));
    expect(condition.excludes).toEqual(["sold out"]);
  });

  it("names a row it left out whose value the request does not say to leave out, and no words", () => {
    const condition = first(showsStandingNo(LEAVE_OUT, { witness: "Few seats left" }));
    expect(condition.excludes).toBeUndefined();
    expect(condition.askedFor).toEqual([MARKED]);
  });

  it("names that row where the request asks for such rows", () => {
    const condition = first(showsStandingNo(INCLUDING));
    expect(condition.excludes).toBeUndefined();
    expect(condition.askedFor).toEqual([MARKED]);
  });

  it("says nothing of a condition that keeps rows having something", () => {
    const condition = first(showsStandingNo(LEAVE_OUT, { wording: "status contains \"Sold out\"" }));
    expect(condition.excludes).toBeUndefined();
    expect(condition.askedFor).toBeUndefined();
  });
});
