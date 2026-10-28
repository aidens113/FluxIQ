import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../../site-reset/index.ts";
import { AutomationStudioSiteResetObservations, automationStudioSiteResetGroupWitness as groupWitness } from "../index.ts";

// t772 w10: one act on a shared list settles by its own subjects. Several lasting acts each add their own subject to one
// list read complete before them. Once some are undone and a fresh load shows their subjects back as the build found them,
// those settle `restored` while the others' subjects still show: each remaining difference is another open act's own
// subject. A difference no act explains keeps every act open, as the whole-group rule always did. Made-up fixture: a
// library's reservations list, each book reserved from its own page; opaque tokens only.

const LIBRARY = "r:library";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[], group: string): List => ({ scope, group, subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
const reservations = (subjects: string[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIBRARY, scope: "p:reservations-page", location: "loc:reservations", collections: [list("p:reservations", subjects, "g:reservations")] });
const bookPage = (n: number): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIBRARY, scope: `p:book-${n}`, location: `loc:book-${n}` });
const row = (n: number): AutomationStudioSiteResetSpot => ({ scope: "p:reservations", subject: `s:book-${n}`, item: `i:book-${n}`, resource: LIBRARY });
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: "Press", kind: "button", ...spot }, verb: "press" }, ...extra });
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot) => ({ effect: "mutate" as const, consequences, control });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
const ids = (entries: unknown): string[] => (Array.isArray(entries) ? entries.map((entry) => (entry as { act: string }).act).sort() : []);
const ALL = ["s:held-a", "s:book-1", "s:book-2", "s:book-3"];

/** Three "Reserve" acts from each book's own page, witnessed on "My reservations" read complete before them; then the list. */
const reserved = () => {
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.observed(reservations(["s:held-a"]));
  const ref = ledger.destinationReceipts()[0]!.ref;
  for (const n of [1, 2, 3]) {
    ledger.observed(bookPage(n));
    ledger.explored(press(`reserve-${n}`, ["create_new"], { subject: `s:book-${n}`, page: `s:book-${n}`, resource: LIBRARY }, { resetDestination: ref }));
  }
  ledger.observed(reservations(ALL));
  return ledger;
};
/** Cancels book `n`'s reservation on its row of the list, admitted and landed. */
const cancel = (ledger: AutomationStudioSiteResetLedger, n: number) => {
  const admitted = ledger.target(`act-${n}`, aim(["delete"], row(n)));
  expect(admitted).toMatchObject({ kind: "admit" });
  ledger.explored(press(`cancel-${n}`, ["delete"], row(n), { undoes: `act-${n}`, on: (admitted as { on: NonNullable<AutomationStudioSiteResetExplored["on"]> }).on }));
};
/** Checks whose `lookAt` loads `loaded` at the reservations list, as the caller's start check feeds it to the ledger. */
const loading = (ledger: AutomationStudioSiteResetLedger, loaded: string[]): AutomationStudioSiteResetChecks => ({ compare, lookAt: async (location) => {
  if (location === "loc:reservations") ledger.observed(reservations(loaded));
} });
/** Acts 1 and 2 cancelled; the read in place after them still draws every row. */
const twoUndone = () => {
  const ledger = reserved();
  cancel(ledger, 1);
  cancel(ledger, 2);
  ledger.observed(reservations(ALL));
  return ledger;
};

describe("acts on one shared list settle by their own subjects (t772 w10)", () => {
  it("settles the two undone acts restored on a load showing their rows gone, and leaves only the third to undo", async () => {
    const ledger = twoUndone();
    const answer = await ledger.beforeTrial(loading(ledger, ["s:held-a", "s:book-3"]));
    expect(answer).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" } });
    expect(ids((answer as { evidence: { actsToUndo?: unknown } }).evidence.actsToUndo)).toEqual(["act-3"]);
    expect(ledger.unsatisfiable()).toEqual([]);
    expect([ledger.standing("act-1"), ledger.standing("act-2"), ledger.standing("act-3")]).toEqual(["restored", "restored", "in_place"]);
    expect(ids(ledger.inPlace())).toEqual(["act-3"]);
    // What is reported as left reads the same settlement: only the third.
    expect(ledger.leftover("act-1")).toMatchObject({ left: "no", standing: "restored" });
    expect(ledger.leftover("act-2")).toMatchObject({ left: "no", standing: "restored" });
    expect(ledger.leftover("act-3")).toMatchObject({ left: "yes", standing: "in_place" });
    expect(ids(ledger.trialRan([]))).toEqual(["act-3"]);
    // The admission agrees: a settled act has nothing left to undo, the third is still admitted.
    expect(ledger.target("act-1", aim(["delete"], row(1)))).not.toMatchObject({ kind: "admit" });
    cancel(ledger, 3);
    expect(await ledger.beforeTrial(loading(ledger, ["s:held-a"]))).toMatchObject({ kind: "admit" });
    expect(ledger.standing("act-3")).toBe("restored");
  });

  it("settles them on a load made by leaving the list's page and opening it again", () => {
    const ledger = twoUndone();
    ledger.observed(bookPage(3));
    ledger.observed(reservations(["s:held-a", "s:book-3"]));
    expect(ids(ledger.inPlace())).toEqual(["act-3"]);
    expect(ledger.leftover("act-1")).toMatchObject({ left: "no", standing: "restored" });
  });

  it("never settles one on the read in place after the undos, even where it draws their rows gone", () => {
    const ledger = reserved();
    cancel(ledger, 1);
    cancel(ledger, 2);
    ledger.observed(reservations(["s:held-a", "s:book-3"]));
    expect(ids(ledger.inPlace())).toEqual(["act-1", "act-2", "act-3"]);
    expect(ledger.unsatisfiable()).toEqual([]);
  });

  it("never settles an act no undo of which landed on a sibling's row: a list may draw its new row only on its next load", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(reservations(["s:held-a"]));
    const ref = ledger.destinationReceipts()[0]!.ref;
    ledger.observed(bookPage(1));
    ledger.explored(press("reserve-1", ["create_new"], { subject: "s:book-1", page: "s:book-1", resource: LIBRARY }, { resetDestination: ref }));
    ledger.observed(reservations(["s:held-a", "s:book-1"]));
    ledger.observed(bookPage(2));
    ledger.explored(press("reserve-2", ["create_new"], { subject: "s:book-2", page: "s:book-2", resource: LIBRARY }, { resetDestination: ref }));
    // Read before the list draws act-2's row: only act-1's shows.
    ledger.observed(reservations(["s:held-a", "s:book-1"]));
    expect(ledger.standing("act-2")).toBe("in_place");
    ledger.observed(reservations(["s:held-a", "s:book-1", "s:book-2"]));
    expect(ids(ledger.inPlace())).toEqual(["act-1", "act-2"]);
  });

  it.each([
    ["a row no act added", ["s:held-a", "s:book-3", "s:stranger"]],
    ["a row the list held before the build gone", ["s:book-3"]],
    ["a row the list held before the build changed in value", undefined]
  ] as const)("keeps every act open on a load that shows %s", async (_shape, loaded) => {
    const ledger = twoUndone();
    if (loaded) await ledger.beforeTrial(loading(ledger, [...loaded]));
    else await ledger.beforeTrial({ compare, lookAt: async () => ledger.observed({ ...reservations([]), collections: [{ ...list("p:reservations", ["s:held-a", "s:book-3"], "g:reservations"), states: { "s:held-a": "v:changed", "s:book-3": "v:s:book-3" } }] }) });
    // Still open, whether to undo or listed apart as one no undo reaches: never settled on a change no act explains.
    expect([...ids(ledger.inPlace()), ...ids(ledger.unsatisfiable())].sort()).toEqual(["act-1", "act-2", "act-3"]);
    for (const act of ["act-1", "act-2"]) {
      expect(ledger.standing(act)).not.toBe("restored");
      expect(ledger.leftover(act)?.left).not.toBe("no");
    }
  });
});

describe("a group witness judged by the act's own subjects (t772 w10)", () => {
  const states = (subjects: string[], changed: Record<string, string> = {}) => Object.fromEntries(subjects.map((subject) => [subject, changed[subject] ?? `v:${subject}`]));
  /** "My reservations" read before act 1 (and `before` acts), then latest read as `now` at clock 1. */
  const seen = (now: string[], changed: Record<string, string> = {}, before = 0) => {
    const observations = new AutomationStudioSiteResetObservations();
    observations.observe({ location: "loc:r", collections: [{ scope: "p:mine", group: "g:mine", subjects: ["s:held-a"], states: states(["s:held-a"]) }] }, true, before, 0);
    observations.observe({ location: "loc:r", collections: [{ scope: "p:mine", group: "g:mine", subjects: now, states: states(now, changed) }] }, true, 3, 1);
    return observations;
  };
  const judge = (observations: AutomationStudioSiteResetObservations, others?: ReadonlyArray<{ sequence: number; subjects: readonly string[] }>, subjects = ["s:book-1"]) =>
    groupWitness({ observations, group: "g:mine", scopes: ["p:mine"], subjects, sequence: 1, since: 1, clock: 1, ...(others ? { others } : {}) }).status;
  const THIRD = [{ sequence: 3, subjects: ["s:book-3"] }];

  it("holds when every remaining difference is another open act's own subject, and differs without them", () => {
    expect(judge(seen(["s:held-a", "s:book-3"]), THIRD)).toBe("holds");
    expect(judge(seen(["s:held-a", "s:book-3"]))).toBe("differs");
    expect(judge(seen(["s:held-a", "s:book-3"]), [])).toBe("differs");
    // Another act's subject changed in value or order is still that act's.
    expect(judge(seen(["s:book-3", "s:held-a"], { "s:book-3": "v:other" }), THIRD)).toBe("holds");
  });

  it("differs while its own subject is not back, or where a difference is no other act's", () => {
    expect(judge(seen(["s:held-a", "s:book-1", "s:book-3"]), THIRD)).toBe("differs");
    expect(judge(seen(["s:held-a", "s:book-3", "s:stranger"]), THIRD)).toBe("differs");
    expect(judge(seen(["s:book-3"]), THIRD)).toBe("differs");
    expect(judge(seen(["s:held-a", "s:book-3"], { "s:held-a": "v:changed" }), THIRD)).toBe("differs");
    // An act that sits on the same subject cannot explain it: its own subject must be back.
    expect(judge(seen(["s:held-a", "s:book-1"]), [{ sequence: 2, subjects: ["s:book-1"] }])).toBe("differs");
  });

  it("never attributes a difference to an act made before the list was read, nor judges an act with no subject but by the whole list", () => {
    // The list was read once 3 acts were recorded: act 3 came before it, so a change of its subject is unexplained for act 4.
    const late = seen(["s:held-a", "s:book-3"], {}, 3);
    expect(groupWitness({ observations: late, group: "g:mine", scopes: ["p:mine"], subjects: ["s:book-4"], sequence: 4, since: 1, clock: 1, others: THIRD }).status).toBe("differs");
    expect(groupWitness({ observations: late, group: "g:mine", scopes: ["p:mine"], subjects: ["s:book-4"], sequence: 4, since: 1, clock: 1, others: [{ sequence: 5, subjects: ["s:book-3"] }] }).status).toBe("holds");
    // An act with no subject of its own is judged by the whole list, as before.
    expect(judge(seen(["s:held-a", "s:book-3"]), THIRD, [])).toBe("differs");
  });
});

// t772 w11: the real shape of a press from an item's own page. Its control is about nothing that tells the items apart --
// every item page's press carries the one subject of the part around it, and no page subject -- so no act's own subject is
// a row of the list it adds to. What ties each act to its row is the removal its undo was admitted as on that list
// (`subjectUndo`, the destination removal: a row the list held neither before the act nor before the build). Headed
// job-undo-redraws-on-load: two of three undos took, one press of the second came undone on the site, and a load then
// showed only that act's row; all three stayed open, the two whose rows were gone named as still to undo.
describe("acts whose own row only their landed undo proved settle by that row (t772 w11)", () => {
  /** What every item page's press is about: the part around it, the same on each page. */
  const SHARED = { subject: "s:actions-bar", resource: LIBRARY };
  const listed = (n: number): AutomationStudioSiteResetSpot => ({ ...row(n), page: "s:reservations-page" });
  /** Three presses from each book's own page naming the list read before them, then the list read after them. */
  const pressed = () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(reservations(["s:held-a"]));
    const ref = ledger.destinationReceipts()[0]!.ref;
    for (const n of [1, 2, 3]) {
      ledger.observed(bookPage(n));
      ledger.explored(press(`reserve-${n}`, ["modify_existing"], { ...SHARED, scope: `p:book-${n}` }, { resetDestination: ref }));
    }
    ledger.observed(reservations(ALL));
    return ledger;
  };
  /** Undoes book `n` from its row of the list: admitted as a removal on the named list, and landed. */
  const remove = (ledger: AutomationStudioSiteResetLedger, n: number) => {
    const admitted = ledger.target(`act-${n}`, aim(["modify_existing"], listed(n)));
    expect(admitted).toMatchObject({ kind: "admit", on: "subject" });
    ledger.explored(press(`unreserve-${n}`, ["modify_existing"], listed(n), { undoes: `act-${n}`, on: "subject" }));
  };

  it("settles the undone acts whose rows a load shows gone, leaving only the act whose row came back", async () => {
    const ledger = pressed();
    remove(ledger, 1);
    remove(ledger, 2);
    ledger.observed(reservations(ALL));
    // Act 2's undo landed, but its row is still there once loaded; act 3's row has no owner proved yet, so nothing settles.
    await ledger.beforeTrial(loading(ledger, ["s:held-a", "s:book-2", "s:book-3"]));
    expect(ids(ledger.inPlace())).toEqual(["act-1", "act-2", "act-3"]);
    expect(ledger.unsatisfiable()).toEqual([]);
    remove(ledger, 3);
    const answer = await ledger.beforeTrial(loading(ledger, ["s:held-a", "s:book-2"]));
    expect(answer).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" } });
    // Only act 2 is left: its own row shows. Acts 1 and 3 are back, each by the row its own undo removed.
    expect([...ids(ledger.inPlace()), ...ids(ledger.unsatisfiable())]).toEqual(["act-2"]);
    expect([ledger.standing("act-1"), ledger.standing("act-3")]).toEqual(["restored", "restored"]);
    expect(ledger.leftover("act-1")).toMatchObject({ left: "no", standing: "restored" });
    expect(ledger.leftover("act-2")?.left).not.toBe("no");
  });

  it("keeps every act open where a row shows that no act's undo proved its own", async () => {
    const ledger = pressed();
    remove(ledger, 1);
    remove(ledger, 3);
    await ledger.beforeTrial(loading(ledger, ["s:held-a", "s:book-2", "s:stranger"]));
    expect([...ids(ledger.inPlace()), ...ids(ledger.unsatisfiable())].sort()).toEqual(["act-1", "act-2", "act-3"]);
    for (const act of ["act-1", "act-3"]) expect(ledger.standing(act)).not.toBe("restored");
  });
});
