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
import { automationStudioSiteResetSettleDecision as decide } from "../index.ts";

// t797 P4 item 2 (rerun round 6 `run-mvrj7qg9-b6dc94f6`, root cause 1): a list read in place after an undo landed is never
// judged -- no `undo` reason and no `no_admissible_undo` -- until it is read fresh, whichever act's undo landed. Many sites
// draw a removal only on the list's next load, so the read in place says nothing yet. t772 counted only the undos of the acts
// that list witnesses; an undo of another act -- one witnessed by its own control alone, whose row the list also showed --
// left the read judged, and the acts the list witnesses were all called unsettleable on it: one row still drawn in place
// outnumbered the acts left to remove it, as in that run.
//
// Made-up fixture: a library catalogue whose entry pages show a "Your reservations" sidebar, a complete list, beside each
// entry's Reserve. Opaque tokens only.

const LIB = "r:library";
const RESERVATIONS = "p:reservations";
const sidebar = (subjects: string[]) => ({ scope: RESERVATIONS, group: "g:reservations", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
/** Entry `n`'s own page: its Reserve in `state` and the sidebar holding `held`. */
const entryPage = (n: number, state: string, held: string[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIB, scope: `p:entry-${n}-page`, location: `loc:entry-${n}`, controls: { [`pl:reserve-${n}`]: { [state]: 1 } }, collections: [sidebar(held)] });
const reserveOn = (n: number, state: string, consequences: AutomationStudioActionConsequence[]): { effect: "mutate"; consequences: AutomationStudioActionConsequence[]; control: AutomationStudioSiteResetSpot & { name: string; kind: string } } =>
  ({ effect: "mutate", consequences, control: { name: "Reserve", kind: "button", resource: LIB, page: `s:entry-${n}`, subject: `s:entry-${n}`, place: `pl:reserve-${n}`, state } });
const pressed = (callId: string, declared: ReturnType<typeof reserveOn>, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, operation: "demo.reserve", declared: { permitted: true, ...declared, verb: "press" }, ...extra });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
const ids = (entries: ReadonlyArray<{ act: string }>): string[] => entries.map((entry) => entry.act);

/**
 * act-1 reserves entry 1 from its page, naming no list: its own Reserve witnesses it. act-2 and act-3 reserve entries 2 and 3,
 * naming the sidebar, read complete before them. Back on entry 1's page, act-1's Reserve is pressed back, and the page is read
 * in place: the Reserve shows free, and the sidebar still draws all three rows.
 */
function reservedThenUndoneInPlace(): AutomationStudioSiteResetLedger {
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.observed(entryPage(1, "st:free", ["s:held-a"]));
  const ref = ledger.destinationReceipts()[0]!.ref;
  ledger.explored(pressed("reserve-1", reserveOn(1, "st:free", ["modify_existing"])));
  ledger.observed(entryPage(1, "st:held", ["s:held-a", "s:entry-1"]));
  for (const n of [2, 3]) {
    ledger.observed(entryPage(n, "st:free", ["s:held-a", "s:entry-1", ...(n === 3 ? ["s:entry-2"] : [])]));
    ledger.explored(pressed(`reserve-${n}`, reserveOn(n, "st:free", ["create_new"]), { resetDestination: ref }));
  }
  ledger.observed(entryPage(1, "st:held", ["s:held-a", "s:entry-1", "s:entry-2", "s:entry-3"]));
  const undo = reserveOn(1, "st:held", ["modify_existing"]);
  expect(ledger.target("act-1", undo)).toMatchObject({ kind: "admit", on: "own" });
  ledger.explored(pressed("unreserve-1", undo, { undoes: "act-1", on: "own" }));
  // The read in place after that undo: the sidebar still draws entry 1's row.
  ledger.observed(entryPage(1, "st:free", ["s:held-a", "s:entry-1", "s:entry-2", "s:entry-3"]));
  return ledger;
}

describe("a list read in place after any act's undo is not judged until it is loaded again (t797 P4 item 2)", () => {
  it("calls neither act the list witnesses unsettleable on that read, and tells both to load the list again", () => {
    const ledger = reservedThenUndoneInPlace();
    expect(ledger.standing("act-1")).toBe("restored");
    expect(ledger.unsatisfiable()).toEqual([]);
    const toUndo = ledger.inPlace();
    expect(ids(toUndo)).toEqual(["act-2", "act-3"]);
    for (const act of toUndo) {
      expect(act.settle).toMatch(/only after it loads again/u);
      expect(act.settle).not.toMatch(/undo this act there/u);
    }
  });

  it("judges the list again once Core's own look loads it: the undone row is gone and the other two are theirs to undo", async () => {
    const ledger = reservedThenUndoneInPlace();
    const looked: string[] = [];
    const checks: AutomationStudioSiteResetChecks = { compare, lookAt: async (location) => {
      looked.push(location);
      ledger.observed(entryPage(1, "st:free", ["s:held-a", "s:entry-2", "s:entry-3"]));
    } };
    await ledger.beforeTrial(checks);
    expect(looked).toEqual(["loc:entry-1"]);
    expect(ledger.unsatisfiable()).toEqual([]);
    const toUndo = ledger.inPlace();
    expect(ids(toUndo)).toEqual(["act-2", "act-3"]);
    for (const act of toUndo) expect(act.settle).toMatch(/undo this act there/u);
  });

  it("still judges a load that shows a row no act can take back: a list loaded again is a fresh read (guard)", async () => {
    const ledger = reservedThenUndoneInPlace();
    // Loaded again, the sidebar also holds a row nobody of this build added: no undo could put it back.
    ledger.observed(entryPage(2, "st:held", ["s:held-a", "s:entry-2", "s:entry-3", "s:stray", "s:other"]));
    expect(ids(ledger.unsatisfiable())).toEqual(["act-2", "act-3"]);
  });
});

describe("the decision on a list read in place (t772 R1; guard)", () => {
  it("is a reload, never an undo, whatever else witnesses the act", () => {
    const group = { status: "differs" as const, scopes: ["p:list"], changed: true, group: "g:list", location: "loc:list", inPlace: true };
    expect(decide({ groups: [group], changeSeen: true, undoLanded: false })).toEqual({ kind: "open", reasons: [{ reason: "reload", witness: "group", location: "loc:list", group: "g:list" }] });
    expect(decide({ groups: [group], toggle: { status: "holds" }, changeSeen: true, undoLanded: true })).toEqual({ kind: "open", reasons: [{ reason: "reload", witness: "group", location: "loc:list", group: "g:list" }] });
    expect(decide({ groups: [{ ...group, inPlace: false }], changeSeen: true, undoLanded: false })).toMatchObject({ kind: "open", reasons: [{ reason: "undo" }] });
  });

  it("settles a list read in place that shows it as the build found it: only a difference is held back", () => {
    expect(decide({ groups: [{ status: "holds", scopes: ["p:list"], changed: true, group: "g:list", inPlace: true }], changeSeen: true, undoLanded: true })).toEqual({ kind: "settled", how: "restored" });
  });
});
