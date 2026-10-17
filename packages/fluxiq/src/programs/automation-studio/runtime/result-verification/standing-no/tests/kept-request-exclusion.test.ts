// A condition written in the request's own exclusion words is kept across a
// build's trials without `keptOut`, and released only by a record showing it
// left out a row Core reads as asked for (t687, `../kept-conditions.ts`,
// `../kept-condition-drop.ts`). A8 cost round `run-mvblov2i-abb7d82e`
// revisions 1-2, where such a condition was dropped on a judge's wholly
// refuted advice. Replayed on a venue's show listings
// (`../../standing-no-record/tests/shows-fixture.ts`).
import { describe, expect, it } from "vitest";
import { LEAVE_OUT, NOT_SOLD_OUT, RATED, showsPlan, showsStandingNo } from "../../standing-no-record/tests/shows-fixture.ts";
import { AutomationStudioResultKeptConditionMemory, automationStudioResultKeptConditionsDropped } from "../index.ts";

const ASKED = showsPlan([NOT_SOLD_OUT, RATED]);
const DROPPED = showsPlan([RATED]);
const NAME = "condition 1 (soldOut is absent)";

/** A gate's memory after each record, each read against the plan that wrote condition 1 as asked. */
function remembered(...records: ReturnType<typeof showsStandingNo>[]) {
  const memory = new AutomationStudioResultKeptConditionMemory();
  records.forEach((record, index) => memory.remember({ revision: index + 1, standingNo: record, plan: ASKED }));
  return memory.conditions();
}

describe("a condition in the request's own exclusion words, kept without keptOut (t687)", () => {
  it("is kept carrying the request's words, its drop refused once in Core's words, and the same drop sent again accepted", () => {
    const carried = remembered(showsStandingNo());
    expect(carried).toEqual([{ name: NAME, revision: 1, written: JSON.stringify({ field: "soldOut", is: "absent" }), keptOut: [], excludes: ["sold out"] }]);
    const found = automationStudioResultKeptConditionsDropped({ carried, plan: DROPPED, subject: "subflow" });
    expect(found?.dropped.map((condition) => condition.name)).toEqual([NAME]);
    expect(found?.said).toContain("shows a condition leaving out rows by what the request itself says to leave out");
    expect(found?.said).toContain("(\"sold out\")");
    expect(found?.said).toContain("brings back rows the request says to leave out");
    expect(found?.said).toContain("Core refuses this once, not twice");
    // Refuse-once (t644): the same drop sent again is accepted.
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: DROPPED, refused: new Set(found!.dropped.map((condition) => condition.written)) })).toBeUndefined();
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: ASKED })).toBeUndefined();
  });

  it("survives a port's round trip", () => {
    const carried = JSON.parse(JSON.stringify(remembered(JSON.parse(JSON.stringify(showsStandingNo())))));
    expect(automationStudioResultKeptConditionsDropped({ carried, plan: DROPPED })?.dropped[0]?.excludes).toEqual(["sold out"]);
  });

  it("stays kept by a later record that left out rows Core cannot account for", () => {
    // The later trial's record reads no value on the marked row either: nothing shows a row asked for.
    const later = showsStandingNo(LEAVE_OUT, { witness: "" });
    expect(later.conditions[0]?.excludes).toBeUndefined();
    expect(later.conditions[0]?.askedFor).toBeUndefined();
    expect(later.conditions[0]?.leftOutAlone?.length).toBeGreaterThan(0);
    expect(remembered(showsStandingNo(), later).map((condition) => condition.name)).toEqual([NAME]);
  });

  it("is released by a later record showing it left out a row whose value the request does not say to leave out", () => {
    const later = showsStandingNo(LEAVE_OUT, { witness: "Few seats left" });
    expect(remembered(showsStandingNo(), later)).toEqual([]);
  });

  it("is never kept where the request asks for such rows", () => {
    expect(remembered(showsStandingNo("List this month's shows at the venue rated 4 or higher, including sold out shows, with columns title and rating."))).toEqual([]);
  });
});
