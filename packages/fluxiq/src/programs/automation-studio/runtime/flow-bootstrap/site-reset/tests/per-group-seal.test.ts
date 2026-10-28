import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetProjectLedger,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

// t751 R1: the seal is per group. A complete read of a list group is its original unless an act of the build already
// counts that group among its witnesses, or an act whose effect location is unknown (legacy unscoped, or with no witness)
// is on the site. One rule in the create-baselines receipts, each ledger's observations and the project's adopted
// originals. Then the exploration door's repeats (the build's explored acts, `witnessed`), and a destination named under
// `undoes` kept only from a call that landed. Made-up fixtures: a recipe box and a shelf, opaque tokens only.

const SITE = "r:site";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[], group: string): List => ({ scope, group, subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
const page = (scope: string, location: string, collections: List[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope, location, collections });
const boxPage = (extra: List[] = []) => page("p:box-page", "loc:box", [list("p:cards", ["s:soup", "s:stew"], "g:box"), list("p:saved", ["s:pie"], "g:box"), ...extra]);
const shelfPage = () => page("p:shelf-page", "loc:shelf", [list("p:shelf", ["s:held"], "g:shelf")]);
const DRAFT: AutomationStudioSiteResetSpot = { subject: "s:bread", page: "s:bread", resource: SITE };
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: "Press", kind: "button", ...spot }, verb: "press" }, ...extra });
const look = (callId: string, undoes: string, resetDestination: string, landed = true): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed, undoes, on: "moving", resetDestination, declared: { permitted: true, effect: "observe", consequences: [], control: { name: null, kind: "page" }, verb: "read" } });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
const refs = (ledger: AutomationStudioSiteResetLedger): string[] => ledger.destinationReceipts().map((receipt) => receipt.ref);
const boxed = (): AutomationStudioSiteResetLedger => {
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.observed(boxPage());
  expect(refs(ledger)).toEqual(["destination-1", "destination-2"]);
  return ledger;
};

describe("the seal is per group (t751 R1)", () => {
  it("a list in a group no act touched still becomes an original after an act elsewhere, and issues its ref", () => {
    const ledger = boxed();
    ledger.explored(press("start-draft", ["create_new"], DRAFT, { resetDestination: "destination-1" }));
    ledger.observed(shelfPage());
    expect(refs(ledger)).toEqual(["destination-3"]);
  });

  it("an act whose effect location is unknown seals every group: a legacy unscoped press, or a scoped one with no witness", () => {
    for (const spot of [{}, { subject: "s:jam", page: "s:jam", resource: SITE }] as AutomationStudioSiteResetSpot[]) {
      const ledger = boxed();
      ledger.explored(press("mark", ["modify_existing"], spot));
      ledger.observed(shelfPage());
      expect(refs(ledger)).toEqual([]);
    }
  });

  it("a group an act counts among its witnesses takes no new original in the ledger's observations", () => {
    const ledger = boxed();
    ledger.explored(press("start-draft", ["create_new"], DRAFT, { resetDestination: "destination-1" }));
    // A list of the touched group first read after the act: never an original, so a later act in it has no own list.
    ledger.observed(boxPage([list("p:new", ["s:one"], "g:box")]));
    ledger.explored(press("mark", ["modify_existing"], { scope: "p:new", subject: "s:one", item: "i:one", resource: SITE }));
    ledger.observed(boxPage([list("p:new", ["s:one"], "g:box")]));
    expect(ledger.standing("act-2")).toBe("in_place");
    expect(ledger.inPlace().find((act) => act.act === "act-2")?.settle).toMatch(/^Nothing read shows where its effect would be/u);
  });

  it("the project keeps originals per group: a later brief adopts a list read after an act in another group", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const first = project.forBrief("brief-1");
    project.observed(boxPage());
    first.observed(boxPage());
    expect(refs(first)).toEqual(["destination-1", "destination-2"]);
    first.explored(press("start-draft", ["create_new"], DRAFT, { resetDestination: "destination-1" }));
    // The shelf is read only through brief-1's gate, after brief-1's act touched the box.
    project.observed(shelfPage());
    first.observed(shelfPage());
    const second = project.forBrief("brief-2");
    second.explored(press("hold", ["modify_existing"], { scope: "p:shelf", subject: "s:held", item: "i:held", resource: SITE }));
    second.observed(shelfPage());
    expect(second.standing("act-2")).toBe("unchanged");
    expect(await second.beforeTrial(compare)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-2" }] } });
  });
});

describe("the exploration door reads the build's explored acts (t751 R3)", () => {
  it("admits a press repeating a witnessed explored act, and refuses one repeating an act with no witness", () => {
    const ledger = boxed();
    ledger.explored(press("start-draft", ["create_new"], DRAFT, { resetDestination: "destination-1" }));
    const declared = { effect: "mutate" as const, consequences: ["create_new" as const], control: { name: "Press", kind: "button", ...DRAFT } };
    expect(ledger.createBaseline(declared, undefined)).toEqual({ kind: "admit" });
    const unwitnessed = boxed();
    unwitnessed.explored(press("start-draft", ["create_new"], DRAFT));
    expect(unwitnessed.createBaseline(declared, undefined)).toMatchObject({ kind: "refused", evidence: { code: "candidate.create_baseline_required" } });
  });
});

describe("a destination named under undoes is kept only from a call that landed (t751 R6)", () => {
  it("a look that did not land names nothing; one that landed names the list, and the fresh read settles the act", () => {
    for (const landed of [false, true]) {
      const ledger = boxed();
      ledger.explored(press("mark", ["modify_existing"], { subject: "s:jam", page: "s:jam", resource: SITE }));
      ledger.explored(look("look.box", "act-1", "destination-1", landed));
      ledger.observed(boxPage());
      expect(ledger.standing("act-1")).toBe(landed ? "unchanged" : "in_place");
    }
  });
});
