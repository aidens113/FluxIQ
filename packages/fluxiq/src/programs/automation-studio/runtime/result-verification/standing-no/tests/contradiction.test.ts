// When a later no is contradicted by what an earlier standing no of the same
// build upheld (t633), and when it is not: Core refutes only what its records
// measure. Records written by hand, on the campsite search of
// `./campsite-swing-fixture.ts`.
import { describe, expect, it } from "vitest";
import { AutomationStudioResultStandingNoMemory, automationStudioResultStandingNoContradicted, type AutomationStudioResultStandingNoRecord } from "../index.ts";

const CABIN = "Aspen Grove Rental Cabin 3";
const CAMPS = ["Cedar Hollow Campground, Site 12", "Bluewater Campground, Loop B Site 4", "Pine Ridge Campground, Walk-in Site 7", "Granite Falls Campground, Site 31"];
const BASE = [
  { name: "condition 1 (promoted is absent)", key: "promoted is absent", leftOutAlone: ["Cedar Hollow Campground, Site 12"] },
  { name: "condition 2 (availability contains [\"Open this weekend\"])", key: "availability contains [\"open this weekend\"]", leftOutAlone: ["Larch Meadow Campground, Site 2"] },
  { name: "condition 3 (rating atLeast 4)", key: "rating atleast 4", leftOutAlone: [] }
];
const CAMPGROUND = { name: "condition 4 (name contains [\"Campground\"])", key: "name contains [\"campground\"]", leftOutAlone: [] };
const NOT_CABIN = { name: "condition 5 (name not contains [\"Cabin\"])", key: "name not contains [\"cabin\"]", leftOutAlone: [] };

/** Revision 1: the cabin stored, a standing no calling it not a campsite. */
const upheld: AutomationStudioResultStandingNoRecord = { stored: [...CAMPS, CABIN], storedWhole: true, conditions: BASE, upheldKind: [CABIN], standing: [{ call: 1 }, { call: 2 }] };
/** Revision 2: the name conditions added, the cabin no longer stored, and both nos asking to remove those conditions. */
const later = (patch: Partial<AutomationStudioResultStandingNoRecord> = {}): AutomationStudioResultStandingNoRecord => ({
  stored: [...CAMPS], storedWhole: true, conditions: [...BASE, CAMPGROUND, NOT_CABIN],
  standing: [{ call: 1, drops: [CAMPGROUND.key, NOT_CABIN.key] }, { call: 2, drops: [CAMPGROUND.key, NOT_CABIN.key] }], ...patch
});

describe("a later no held to what an earlier standing no upheld (t633)", () => {
  it("is contradicted where its remedy takes the read back to the conditions that kept the rows that no called not the asked kind", () => {
    const found = automationStudioResultStandingNoContradicted([{ revision: 1, record: upheld }], later());
    expect(found).toMatchObject({ revision: 1, rows: 1, conditions: [CAMPGROUND.name, NOT_CABIN.name] });
    expect(found!.said).toContain("Revision 1, read without condition 4");
    expect(found!.said).toContain("stored a row that the no standing on its trial called not the kind of thing the request asks for");
    expect(found!.said).toContain("this no is not taken: the verdict is unsure, not no");
    // A count, never the row's label.
    expect(found!.said).not.toContain(CABIN);
  });

  it("is not contradicted where Core cannot measure it", () => {
    const earlier = [{ revision: 1, record: upheld }];
    // The later revision still stores the row, or Core does not hold every row it stored.
    expect(automationStudioResultStandingNoContradicted(earlier, later({ stored: [...CAMPS, CABIN] }))).toBeUndefined();
    expect(automationStudioResultStandingNoContradicted(earlier, later({ storedWhole: false }))).toBeUndefined();
    // A no that asks for more than removing conditions, or that names a row (no `drops`), beside one that does.
    expect(automationStudioResultStandingNoContradicted(earlier, later({ standing: [{ call: 1, drops: [CAMPGROUND.key, NOT_CABIN.key] }, { call: 2 }] }))).toBeUndefined();
    // A remedy that removes one condition only leaves another the earlier revision did not have.
    expect(automationStudioResultStandingNoContradicted(earlier, later({ standing: [{ call: 1, drops: [CAMPGROUND.key] }] }))).toBeUndefined();
    // A remedy removing a condition the earlier revision already read with.
    expect(automationStudioResultStandingNoContradicted(earlier, later({ standing: [{ call: 1, drops: [CAMPGROUND.key, NOT_CABIN.key, BASE[2]!.key] }] }))).toBeUndefined();
    // A condition the later revision keeps left the row out by itself: removing the others would not bring it back.
    expect(automationStudioResultStandingNoContradicted(earlier, later({ conditions: [BASE[0]!, BASE[1]!, { ...BASE[2]!, leftOutAlone: [CABIN] }, CAMPGROUND, NOT_CABIN] }))).toBeUndefined();
    // A condition with no wording to compare.
    expect(automationStudioResultStandingNoContradicted(earlier, later({ conditions: [...BASE, CAMPGROUND, { name: NOT_CABIN.name }] }))).toBeUndefined();
    // No earlier no upheld anything.
    expect(automationStudioResultStandingNoContradicted([{ revision: 1, record: { ...upheld, upheldKind: undefined } }], later())).toBeUndefined();
  });

  it("is kept by a gate's memory only from a standing no of another revision that upheld rows, and any value not of the record's shape is no record", () => {
    const memory = new AutomationStudioResultStandingNoMemory();
    // A yes, an unsure, or a no without a record keeps nothing.
    expect(memory.weigh({ revision: 1, verdict: "yes", standingNo: upheld })).toBeUndefined();
    expect(memory.weigh({ revision: 1, verdict: "no", standingNo: { stored: "not a list" } })).toBeUndefined();
    expect(memory.weigh({ revision: 2, verdict: "no", standingNo: later() })).toBeUndefined();
    // The no that upheld the row is kept; a later no of the same revision is never held to it.
    expect(memory.weigh({ revision: 1, verdict: "no", standingNo: upheld })).toBeUndefined();
    expect(memory.weigh({ revision: 1, verdict: "no", standingNo: later() })).toBeUndefined();
    expect(memory.weigh({ revision: 3, verdict: "no", standingNo: later() })).toMatchObject({ revision: 1, rows: 1 });
    expect(memory.weigh({ revision: 3, verdict: "unsure", standingNo: later() })).toBeUndefined();
  });

  it("is said in words naming no site, task or product", () => {
    const found = automationStudioResultStandingNoContradicted([{ revision: 1, record: upheld }], later());
    const words = found!.said.replace(/condition \d+ \([^)]*\)/gu, "condition");
    expect(words).not.toMatch(/\b(?:paper|towels?|holders?|pickup|packs?|retailer|valueridge|cabins?|campsites?|campground)\b/iu);
  });
});
