import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AutomationStudioSiteResetLedger,
  automationStudioSiteResetPlacedCall,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetPlace,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../../site-reset/index.ts";

// P4, CC4 `inverse` (`../claims.ts`, header): `undoes` is a hint, and a press that names no act but reverses an open act's
// recorded effect at the same witness is recorded as that act's undo instead of as an act of its own. And a look under
// `undoes` attaches a list only on the act's own page when its change showed there (office `run-mvrj7qg8-6916b3f7`).
// Made-up fixture: a lending library in one tab (one resource), opaque tokens only.

const LIBRARY = "r:library";
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });

/** The entry page of one book, whose Reserve control shows `state` at its place. */
const entry = (state: string): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIBRARY, scope: "p:entry-1", location: "loc:entry-1", controls: { "pl:reserve-1": { [state]: 1 } } });
const RESERVE: AutomationStudioSiteResetSpot = { resource: LIBRARY, scope: "p:entry-1", subject: "s:atlas", page: "s:atlas", place: "pl:reserve-1" };

const press = (callId: string, operation: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, operation, declared: { permitted: true, effect: "mutate", consequences, control: { name: "Reserve", kind: "button", ...spot }, verb: "press" }, ...extra });
const ids = (ledger: AutomationStudioSiteResetLedger) => ledger.exploredActs().map((act) => act.id);
const leftIds = (ledger: AutomationStudioSiteResetLedger) => [...ledger.inPlace(), ...ledger.unsatisfiable(), ...ledger.possiblyInPlace()].map((act) => act.act);

/** Reserve, read back, then pressed back: `undoes` named by `hint`, or not. */
const reservedThenBack = (hint: boolean) => {
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.observed(entry("st:free"));
  ledger.explored(press("reserve", "library.toggle-hold", ["modify_existing"], { ...RESERVE, state: "st:free" }));
  ledger.observed(entry("st:held"));
  ledger.explored(press("unreserve", "library.toggle-hold", ["modify_existing"], { ...RESERVE, state: "st:held" }, hint ? { undoes: "act-1", on: "own" } : {}));
  ledger.observed(entry("st:free"));
  return ledger;
};

describe("a press that reverses an open act's own control is that act's undo, `undoes` or not (P4)", () => {
  it("records no act of its own and settles the act it reversed, exactly as the same press named under undoes", async () => {
    const unhinted = reservedThenBack(false);
    const hinted = reservedThenBack(true);
    expect(ids(unhinted)).toEqual(["act-1"]);
    expect(ids(unhinted)).toEqual(ids(hinted));
    expect(unhinted.standing("act-1")).toBe("restored");
    expect(unhinted.standing("act-1")).toBe(hinted.standing("act-1"));
    expect(leftIds(unhinted)).toEqual([]);
    // Nothing of the paired press is left, asked for or said before a trial.
    expect(unhinted.standing("act-2")).toBe("unchanged");
    expect(await unhinted.beforeTrial(compare)).toEqual(await hinted.beforeTrial(compare));
    // The next lasting press is an act of its own again.
    unhinted.explored(press("reserve.again", "library.toggle-hold", ["modify_existing"], { ...RESERVE, state: "st:free" }));
    expect(ids(unhinted)).toEqual(["act-1", "act-3"]);
  });

  it("a press that flips another control on the act's page is an act of its own", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed({ ...entry("st:free"), controls: { "pl:reserve-1": { "st:free": 1 }, "pl:notify-1": { "st:off": 1 } } });
    ledger.explored(press("reserve", "library.toggle-hold", ["modify_existing"], { ...RESERVE, state: "st:free" }));
    ledger.observed({ ...entry("st:held"), controls: { "pl:reserve-1": { "st:held": 1 }, "pl:notify-1": { "st:off": 1 } } });
    ledger.explored(press("notify", "library.toggle-notify", ["modify_existing"], { ...RESERVE, place: "pl:notify-1", state: "st:off" }));
    ledger.observed({ ...entry("st:held"), controls: { "pl:reserve-1": { "st:held": 1 }, "pl:notify-1": { "st:on": 1 } } });
    expect(ids(ledger)).toEqual(["act-1", "act-2"]);
    expect(ledger.standing("act-1")).toBe("in_place");
  });
});

/** Runs one press through the reads around it (`../../site-reset/act-places.ts`) into the real ledger, as a build's exploration does. */
async function placedPress(ledger: AutomationStudioSiteResetLedger, explored: AutomationStudioSiteResetExplored, before: AutomationStudioSiteResetRead, after: AutomationStudioSiteResetRead): Promise<void> {
  const reads = [before, after];
  await automationStudioSiteResetPlacedCall({
    call: { callId: explored.callId, toolId: "core.run_node", value: { node: explored.operation ?? "", consequences: [...(explored.declared?.consequences ?? [])] } },
    ledger,
    reader: { read: async () => reads.shift() ?? { unread: "no_answer" } },
    run: async () => ledger.explored(explored)
  });
}

const HOLD = "ef:hold-atlas";
/** The book's own page, its Reserve control showing `state`, with the client's effect record of the press just before. */
const entryWith = (state: string, effect?: unknown, differs: string[] = []): AutomationStudioSiteResetRead => ({ ...entry(state), differs, ...(effect !== undefined ? { effect } : {}) });
/** The holds page, listing the book's hold row with its Cancel control, or not. */
const holds = (listed: boolean, effect?: unknown, differs: string[] = []): AutomationStudioSiteResetRead => ({ state: {}, differs, resource: LIBRARY, scope: "p:holds", location: "loc:holds", controls: listed ? { "pl:cancel-1": { "st:cancel": 1 } } : {}, ...(effect !== undefined ? { effect } : {}) });
const CANCEL: AutomationStudioSiteResetSpot = { resource: LIBRARY, scope: "p:holds", subject: "s:atlas", item: "i:hold-atlas", place: "pl:cancel-1", state: "st:cancel" };

/** Reserve on the book's page with an effect record, then Cancel on the holds page, naming no act, with `cancelEffect`. */
async function reservedThenCancelled(reserveEffect: JsonObject, cancelEffect: JsonObject, cancel = "library.cancel-hold"): Promise<AutomationStudioSiteResetLedger> {
  const ledger = new AutomationStudioSiteResetLedger();
  await placedPress(ledger, press("reserve", "library.toggle-hold", ["modify_existing"], { ...RESERVE, state: "st:free" }), entryWith("st:free"), entryWith("st:held", reserveEffect, ["held for you"]));
  await placedPress(ledger, press("cancel", cancel, ["modify_existing"], CANCEL), holds(true), holds(false, cancelEffect, ["hold removed"]));
  return ledger;
}
const reserved = (extra: JsonObject = {}): JsonObject => ({ class: "commit", places: [{ place: HOLD, before: "v:none", after: "v:held" }], ...extra });
const cancelled = { class: "commit", places: [{ place: HOLD, before: "v:held", after: "v:none" }], placeChanged: false };

describe("the client's effect record pairs an undo made on another page (CC4)", () => {
  it("a press whose effect is the act's reversed at the same place is its undo: no act of its own, and the act settles on its page's read", async () => {
    const ledger = await reservedThenCancelled(reserved(), cancelled);
    expect(ids(ledger)).toEqual(["act-1"]);
    expect(leftIds(ledger)).not.toContain("act-2");
    ledger.observed(entry("st:free"));
    expect(ledger.standing("act-1")).toBe("restored");
    expect(leftIds(ledger)).toEqual([]);
  });

  it("an act the client says is irreversible is never paired", async () => {
    const ledger = await reservedThenCancelled(reserved({ inverse: { kind: "irreversible" } }), cancelled);
    expect(ids(ledger)).toEqual(["act-1", "act-2"]);
  });

  it("an inverse the client gave narrows the pairing to the operation and control it names", async () => {
    const inverse = { action: "library.cancel-hold", control: "pl:cancel-1" };
    expect(ids(await reservedThenCancelled(reserved({ inverse }), cancelled, "library.other-press"))).toEqual(["act-1", "act-2"]);
    expect(ids(await reservedThenCancelled(reserved({ inverse: { ...inverse, control: "pl:other" } }), cancelled))).toEqual(["act-1", "act-2"]);
    expect(ids(await reservedThenCancelled(reserved({ inverse }), cancelled))).toEqual(["act-1"]);
    // With no effect places the pairing is by the control's own counts, and `toState` is the state the press leaves it in.
    const byCounts = async (toState: string) => {
      const ledger = new AutomationStudioSiteResetLedger();
      const record = { inverse: { action: "library.toggle-hold", control: "pl:reserve-1", toState } };
      await placedPress(ledger, press("reserve", "library.toggle-hold", ["modify_existing"], { ...RESERVE, state: "st:free" }), entryWith("st:free"), entryWith("st:held", record, ["held for you"]));
      await placedPress(ledger, press("unreserve", "library.toggle-hold", ["modify_existing"], { ...RESERVE, state: "st:held" }), entryWith("st:held"), entryWith("st:free", undefined, ["hold released"]));
      return ids(ledger);
    };
    expect(await byCounts("st:other")).toEqual(["act-1", "act-2"]);
    expect(await byCounts("st:free")).toEqual(["act-1"]);
  });

  it("an effect that is not exactly the act's reversed, or a press two open acts would match, pairs nothing", async () => {
    const partly = { places: [...cancelled.places, { place: "ef:fines", before: "v:0", after: "v:1" }] };
    expect(ids(await reservedThenCancelled(reserved(), partly))).toEqual(["act-1", "act-2"]);
    const ledger = new AutomationStudioSiteResetLedger();
    await placedPress(ledger, press("reserve", "library.toggle-hold", ["modify_existing"], { ...RESERVE, state: "st:free" }), entryWith("st:free"), entryWith("st:held", reserved(), ["held for you"]));
    await placedPress(ledger, press("reserve.copy", "library.toggle-hold", ["modify_existing"], { ...RESERVE, place: "pl:reserve-copy", state: "st:free" }), entryWith("st:held"), entryWith("st:held", reserved(), ["second copy held"]));
    await placedPress(ledger, press("cancel", "library.cancel-hold", ["modify_existing"], CANCEL), holds(true), holds(false, cancelled, ["hold removed"]));
    expect(ids(ledger)).toEqual(["act-1", "act-2", "act-3"]);
  });

  it("parses the record member by member: malformed members are dropped, the rest kept, and none at all is no effect", async () => {
    const placed: AutomationStudioSiteResetPlace[] = [];
    const capture = (effect: unknown) => {
      const reads = [entryWith("st:free"), entryWith("st:held", effect, ["held"])];
      return automationStudioSiteResetPlacedCall({
        call: { callId: "press", toolId: "core.run_node", value: { consequences: ["modify_existing"] } },
        ledger: { actOf: () => "act-1", placed: (_act, place) => void placed.push(place), undoSeen: () => undefined },
        reader: { read: async () => reads.shift() ?? { unread: "no_answer" } },
        run: async () => undefined
      });
    };
    await capture({ class: "bogus", places: [{ place: HOLD, before: "v:none", after: "v:held" }, { place: 3 }, "x"], placeChanged: "yes", inverse: { action: "library.cancel-hold" } });
    await capture({ class: "state", inverse: { kind: "irreversible", action: "x" } });
    await capture({ class: 7, places: "all", inverse: { kind: "maybe" } });
    await capture("not an object");
    expect(placed.map((place) => place.effect)).toEqual([{ places: [{ place: HOLD, before: "v:none", after: "v:held" }] }, { class: "state", inverse: { kind: "irreversible" } }, undefined, undefined]);
  });
});

describe("a look under `undoes` attaches a list only on the act's own page (P4)", () => {
  /** Renew changed the loan's due date on the loans page; the holds page is another page of the same tab. */
  const renewed = () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed({ state: {}, differs: [], resource: LIBRARY, scope: "p:holds", location: "loc:holds", collections: [{ scope: "p:hold-list", group: "g:holds", subjects: ["s:atlas"], states: { "s:atlas": "v:held" } }] });
    const holdList = ledger.destinationReceipts()[0]!.ref;
    ledger.observed({ state: {}, differs: [], resource: LIBRARY, scope: "p:loans", location: "loc:loans", collections: [{ scope: "p:loan-list", group: "g:loans", subjects: ["s:novel"], states: { "s:novel": "v:due-1" } }] });
    const loanList = ledger.destinationReceipts()[0]!.ref;
    ledger.explored(press("renew", "library.renew", ["modify_existing"], { resource: LIBRARY, scope: "p:loans", subject: "s:novel", item: "i:loan-novel" }));
    ledger.placed("act-1", { state: {}, location: "loc:loans", changed: ["due date"] });
    return { ledger, holdList, loanList };
  };
  const look = (undoes: string, resetDestination: string): AutomationStudioSiteResetExplored => ({ callId: `look.${resetDestination}`, toolId: "core.run_node", landed: true, undoes, on: "moving", resetDestination, declared: { permitted: true, effect: "mutate", consequences: [], control: { name: null, kind: "page" }, verb: "go to" } });
  const destinations = (ledger: AutomationStudioSiteResetLedger) => ledger.exploredActs().find((act) => act.id === "act-1")?.destinations;

  it("a list read on another page of the act's resource, never named for it, leaves its destinations unchanged", () => {
    const { ledger, holdList } = renewed();
    ledger.explored(look("act-1", holdList));
    expect(destinations(ledger)).toEqual([]);
  });

  it("a list read on another resource is not attached either, and one read on the act's own page still is", () => {
    const { ledger, loanList } = renewed();
    ledger.observed({ state: {}, differs: [], resource: "r:other-tab", scope: "p:catalogue", location: "loc:catalogue", collections: [{ scope: "p:books", group: "g:books", subjects: ["s:atlas"], states: { "s:atlas": "v:on-shelf" } }] });
    const elsewhere = ledger.destinationReceipts()[0]!.ref;
    ledger.explored(look("act-1", elsewhere));
    expect(destinations(ledger)).toEqual([]);
    ledger.explored(look("act-1", loanList));
    expect(destinations(ledger)).toEqual([{ scope: "p:loan-list", group: "g:loans" }]);
  });
});
