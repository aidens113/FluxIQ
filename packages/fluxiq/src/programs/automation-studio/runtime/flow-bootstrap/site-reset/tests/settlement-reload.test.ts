import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

/** Whether a trial starts with acts of this build still on the site (t775: said under `startedWith.acts`; a trial is never refused for them). */
function stillOpen(decision: { kind: string; startedWith?: { acts?: unknown } }): boolean {
  return decision.kind === "admit" && Array.isArray(decision.startedWith?.acts) && decision.startedWith.acts.length > 0;
}

// A list a site draws again only when it is loaded again (t751 final acceptance, headed job-unexplored-step on the job
// board's My jobs): after an undo lands, the read in place still shows the removed row. Core loads the named list again,
// once per landed undo, before it judges the act, and never calls the act unsettleable on that stale read
// (`../../reset-settlement/judge.ts`, `lookFirst`). Made-up fixtures: a saved list, opaque tokens only.

const SITE = "r:site";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[], group: string): List => ({ scope, group, subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
const page = (scope: string, location: string, collections: List[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope, location, collections });
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: "Press", kind: "button", ...spot }, verb: "press" }, ...extra });
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot) => ({ effect: "mutate" as const, consequences, control });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
/** Checks whose `lookAt` feeds the read at that location to the ledger, as the caller's start check does, and records each look. */
const looking = (ledger: AutomationStudioSiteResetLedger, reads: Record<string, AutomationStudioSiteResetRead>) => {
  const looked: string[] = [];
  const checks: AutomationStudioSiteResetChecks = { compare, lookAt: async (location) => {
    looked.push(location);
    const read = reads[location];
    if (read) ledger.observed(read);
  } };
  return { looked, checks };
};
const minePage = () => page("p:mine-page", "loc:mine", [list("p:mine", ["s:held-a", "s:held-b"], "g:mine"), list("p:mine-old", ["s:held-c"], "g:mine")]);

describe("an undo whose list is drawn again only on its next load (job board My jobs)", () => {
  it("reloads a named list whose in-place read still shows the row after its undo landed, and admits the trial", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(minePage());
    const ref = ledger.destinationReceipts()[0]!.ref;
    ledger.explored(press("save", ["modify_existing"], { subject: "s:atlas", page: "s:atlas", resource: SITE }, { resetDestination: ref }));
    const saved = () => page("p:mine-page", "loc:mine", [list("p:mine", ["s:held-a", "s:held-b", "s:atlas"], "g:mine"), list("p:mine-old", ["s:held-c"], "g:mine")]);
    ledger.observed(saved());
    const own: AutomationStudioSiteResetSpot = { scope: "p:mine", subject: "s:atlas", item: "i:atlas", resource: SITE };
    const admitted = ledger.target("act-1", aim(["modify_existing"], own));
    expect(admitted).toMatchObject({ kind: "admit" });
    ledger.explored(press("undo", ["modify_existing"], own, { undoes: "act-1", on: (admitted as { on: NonNullable<AutomationStudioSiteResetExplored["on"]> }).on }));
    // The read in place after the undo: the row is still drawn.
    ledger.observed(saved());
    const { looked, checks } = looking(ledger, { "loc:mine": minePage() });
    expect(stillOpen(await ledger.beforeTrial(checks))).toBe(false);
    expect(looked).toEqual(["loc:mine"]);
    expect(ledger.standing("act-1")).toBe("restored");
  });

  it("reloads it once per landed undo: a row the reload still shows stays to undo, and is not looked at again", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(minePage());
    const ref = ledger.destinationReceipts()[0]!.ref;
    ledger.explored(press("save", ["modify_existing"], { subject: "s:atlas", page: "s:atlas", resource: SITE }, { resetDestination: ref }));
    const saved = () => page("p:mine-page", "loc:mine", [list("p:mine", ["s:held-a", "s:held-b", "s:atlas"], "g:mine"), list("p:mine-old", ["s:held-c"], "g:mine")]);
    ledger.observed(saved());
    const own: AutomationStudioSiteResetSpot = { scope: "p:mine", subject: "s:atlas", item: "i:atlas", resource: SITE };
    const admitted = ledger.target("act-1", aim(["modify_existing"], own));
    ledger.explored(press("undo", ["modify_existing"], own, { undoes: "act-1", on: (admitted as { on: NonNullable<AutomationStudioSiteResetExplored["on"]> }).on }));
    ledger.observed(saved());
    // The undo did not take: the reload still shows the row.
    const { looked, checks } = looking(ledger, { "loc:mine": saved() });
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { acts: expect.arrayContaining([expect.anything()]) } });
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { acts: expect.arrayContaining([expect.anything()]) } });
    expect(looked).toEqual(["loc:mine"]);
    expect(ledger.standing("act-1")).not.toBe("restored");
  });
});

// t772 R1/R2 (rerun round 6 `run-mvrj7qg9-b6dc94f6`, cause 1): three acts witnessed on one list, one undo lands, and the
// read in place still draws all three rows. That read is stale for settlement and reach alike
// (`../../reset-settlement/observations.ts`), so no act is called unsettleable on it, and an undo refusal that says another
// call on this page can meet it never lists its own act, or an act no undo was tried on, as one no call can settle.
// Made-up fixtures: a library's reservations, opaque tokens only.
describe("acts on a list read in place after one of their undos landed (t772 R1, R2)", () => {
  const LIBRARY = "r:library";
  const reservations = (subjects: string[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIBRARY, scope: "p:reservations-page", location: "loc:reservations", collections: [list("p:reservations", subjects, "g:reservations")] });
  const bookPage = (n: number): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIBRARY, scope: `p:book-${n}`, location: `loc:book-${n}` });
  const row = (n: number): AutomationStudioSiteResetSpot => ({ scope: "p:reservations", subject: `s:book-${n}`, item: `i:book-${n}`, resource: LIBRARY });
  const ALL = ["s:held-a", "s:book-1", "s:book-2", "s:book-3"];
  const ids = (entries: unknown): string[] => (Array.isArray(entries) ? entries.map((entry) => (entry as { act: string }).act) : []);
  /** Three "Reserve" acts from each book's own page, witnessed on the reservations list read complete before them; then the list. */
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

  it("calls no act unsettleable on the read in place, keeps every act to undo saying to load the list again, and settles them on loads", async () => {
    const ledger = reserved();
    cancel(ledger, 1);
    // The read in place after the undo: the site still draws all three rows.
    ledger.observed(reservations(ALL));
    expect(ledger.unsatisfiable()).toEqual([]);
    const inPlace = ledger.inPlace();
    expect(ids(inPlace)).toEqual(["act-1", "act-2", "act-3"]);
    for (const act of inPlace) expect(act.settle).toMatch(/only after it loads again: .*open that list's page again/u);
    // Core's own look loads the list again: the cancelled row is gone, the other two acts stay to undo and are judged.
    const { looked, checks } = looking(ledger, { "loc:reservations": reservations(["s:held-a", "s:book-2", "s:book-3"]) });
    expect(stillOpen(await ledger.beforeTrial(checks))).toBe(true);
    expect(looked).toEqual(["loc:reservations"]);
    expect(ledger.unsatisfiable()).toEqual([]);
    expect(ids(ledger.inPlace())).toEqual(expect.arrayContaining(["act-2", "act-3"]));
    for (const act of ledger.inPlace()) expect(act.settle ?? "").not.toMatch(/loads again/u);
    // The other two undone, and the list loaded again: all three are back.
    cancel(ledger, 2);
    cancel(ledger, 3);
    ledger.observed(reservations(["s:held-a", "s:book-1"]));
    const again = looking(ledger, { "loc:reservations": reservations(["s:held-a"]) });
    expect(stillOpen(await ledger.beforeTrial(again.checks))).toBe(false);
    expect(again.looked).toEqual(["loc:reservations"]);
    for (const act of ["act-1", "act-2", "act-3"]) expect(ledger.standing(act)).toBe("restored");
  });

  it("counts a read after leaving the list's page and opening it again as a load", () => {
    const ledger = reserved();
    cancel(ledger, 1);
    ledger.observed(reservations(ALL));
    expect(ids(ledger.inPlace())).toEqual(["act-1", "act-2", "act-3"]);
    ledger.observed(bookPage(2));
    ledger.observed(reservations(["s:held-a", "s:book-2", "s:book-3"]));
    for (const act of ledger.inPlace()) expect(act.settle ?? "").not.toMatch(/loads again/u);
    expect(ledger.unsatisfiable()).toEqual([]);
  });

  it("leaves a row a spent act's landed undo removed to that act, not to the others", async () => {
    const ledger = reserved();
    cancel(ledger, 1);
    ledger.observed(reservations(ALL));
    // Loaded again, and the list still holds the cancelled row: it is act-1's, so acts 2 and 3 each still have one to remove.
    const { checks } = looking(ledger, { "loc:reservations": reservations(ALL) });
    await ledger.beforeTrial(checks);
    expect(ledger.unsatisfiable()).toEqual([]);
    expect(ids(ledger.inPlace())).toEqual(expect.arrayContaining(["act-2", "act-3"]));
  });

  it("never lists, beside an undo refusal another call on this page can meet, its own act or an untried act as unsettleable", () => {
    const ledger = reserved();
    cancel(ledger, 1);
    ledger.observed(reservations(ALL));
    // An undo of act-2 declared with no lasting class: refused, and another call on this page can meet it.
    const refused = ledger.target("act-2", aim([], row(2)));
    expect(refused).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unproved", canMeet: "this_page" } });
    const evidence = (refused as { evidence: { actsUnsettleable?: unknown; actsToUndo?: unknown } }).evidence;
    expect(ids(evidence.actsUnsettleable)).not.toContain("act-2");
    expect(ids(evidence.actsUnsettleable)).not.toContain("act-3");
    expect(ids(evidence.actsToUndo)).toEqual(expect.arrayContaining(["act-2", "act-3"]));
  });
});
