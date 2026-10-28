import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

// Which list may witness an act (t772 w3): a look under `undoes` that names a list attaches it to the act only when
// the list was read on the act's own resource, or the act already named it. A list read on an unrelated page could never
// show the act's effect, so settling the act by that list staying unchanged is unsound. Made-up fixtures: a notes app
// (the act's site) and an unrelated library catalogue, opaque tokens only.

const NOTES = "r:notes";
const CATALOGUE = "r:catalogue";
const notesPage = (states: Record<string, string> = {}): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: NOTES, scope: "p:notes-page", location: "loc:notes", collections: [{ scope: "p:notes", group: "g:notes", subjects: ["s:draft", "s:memo"], states: { "s:draft": "v:draft", "s:memo": "v:off", ...states } }] });
const cataloguePage = (): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: CATALOGUE, scope: "p:catalogue-page", location: "loc:catalogue", collections: [{ scope: "p:books", group: "g:books", subjects: ["s:novel", "s:atlas"], states: { "s:novel": "v:novel", "s:atlas": "v:atlas" } }] });
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: "Pin", kind: "button", ...spot }, verb: "press" }, ...extra });
const look = (callId: string, undoes: string, resetDestination: string): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, undoes, on: "moving", resetDestination, declared: { permitted: true, effect: "mutate", consequences: [], control: { name: null, kind: "page" }, verb: "go to" } });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
const ACT: AutomationStudioSiteResetSpot = { subject: "s:memo", page: "s:memo", resource: NOTES };

/** The act pins a note on the notes site; the pin did not show on the notes list, and the model then looked at the catalogue. */
const pinned = () => {
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.observed(cataloguePage());
  const books = ledger.destinationReceipts()[0]!.ref;
  ledger.observed(notesPage());
  const notes = ledger.destinationReceipts()[0]!.ref;
  ledger.explored(press("pin.note", ["modify_existing"], ACT));
  ledger.observed(notesPage());
  return { ledger, books, notes };
};
const destinationsOf = (ledger: AutomationStudioSiteResetLedger): unknown => ledger.exploredActs().find((act) => act.id === "act-1")?.destinations;

describe("a look under `undoes` names a list only on the act's own resource (t772 w3)", () => {
  it("a list read on another page, never named for the act, is not attached and settles nothing", async () => {
    const { ledger, books } = pinned();
    ledger.explored(look("go.catalogue", "act-1", books));
    expect(destinationsOf(ledger)).toEqual([]);
    expect(ledger.standing("act-1")).toBe("in_place");
    await ledger.beforeTrial(compare);
    expect(ledger.standing("act-1")).not.toBe("unchanged");
  });

  it("a list read on the act's own resource is still attached", () => {
    const { ledger, notes } = pinned();
    ledger.explored(look("go.notes", "act-1", notes));
    expect(destinationsOf(ledger)).toEqual([{ scope: "p:notes", group: "g:notes" }]);
  });

  it("a list the act's own press named stays attached once, however a later look names it", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(notesPage());
    const notes = ledger.destinationReceipts()[0]!.ref;
    ledger.explored(press("pin.note", ["modify_existing"], ACT, { resetDestination: notes }));
    expect(destinationsOf(ledger)).toEqual([{ scope: "p:notes", group: "g:notes" }]);
    ledger.explored(look("go.notes", "act-1", notes));
    expect(destinationsOf(ledger)).toEqual([{ scope: "p:notes", group: "g:notes" }]);
  });
});
