import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

// One rule for looks (L1 build repeats): a call under `undoes` admitted
// `moving` -- nothing lasting, no item: a navigation, opening a view -- is a
// look, never an undo attempt. It may name a destination; it counts no
// attempt, sets no `undoneBy`, moves no clock and presses no place, and the
// fresh read settles the act. Made-up fixtures: a reading list, opaque tokens.

const SITE = "r:site";
const mine = (states: Record<string, string> = {}) => [{ scope: "p:mine", group: "g:mine", subjects: ["s:held", "s:atlas"], states: { "s:held": "v:held", "s:atlas": "v:off", ...states } }];
const minePage = (states: Record<string, string> = {}): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope: "p:mine-page", location: "loc:mine", collections: mine(states) });
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: "Keep", kind: "button", ...spot }, verb: "press" }, ...extra });
/** A navigation as the domain declares it: `mutate`, nothing lasting, no control named, no item. */
const NAVIGATION = { effect: "mutate" as const, consequences: [], control: {} };
const navigation = (callId: string, undoes: string, resetDestination?: string): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, undoes, on: "moving", ...(resetDestination ? { resetDestination } : {}), declared: { permitted: true, effect: "mutate", consequences: [], control: { name: null, kind: "page" }, verb: "go to" } });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });

describe("a look under `undoes` is never an undo (L1 build repeats)", () => {
  it("a navigation naming a ref settles a press the site failed `unchanged`, and every later trial's judge is told it was left", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(minePage());
    const ref = ledger.destinationReceipts()[0]!.ref;
    ledger.explored(press("save.detail", ["modify_existing"], { subject: "s:atlas", page: "s:atlas", resource: SITE }));
    // The site failed the save: the list read after it is as the build found it.
    ledger.observed(minePage());
    expect(ledger.target("act-1", NAVIGATION)).toEqual({ kind: "admit", on: "moving", allowed: [] });
    ledger.explored(navigation("go.mine", "act-1", ref));
    // No clock moved: the read before the look is still fresh, and no look of Core's is needed.
    const decision = await ledger.beforeTrial(compare);
    expect(decision).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", call: "save.detail", did: `press "Keep" button (${WORDS.leftUnchanged()})` }] } });
    expect(ledger.standing("act-1")).toBe("unchanged");
    // No attempt and no `undoneBy`: the act is left, never undone.
    const claim = ledger.claim("act-1");
    expect(claim).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept" } });
    expect(claim.kind === "refused" ? claim.evidence.undoneBy : undefined).toBeUndefined();
    // Settled unchanged: told to the judge as above, never returned as left on the site (t772 w7, `../leftover.ts`).
    expect(ledger.trialRan([], "trial.1").map((act) => act.act)).toEqual([]);
  });

  it("a real press on the act's own control still settles `restored`, and a look before it undoes nothing", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(minePage());
    const ROW: AutomationStudioSiteResetSpot = { scope: "p:mine", subject: "s:atlas", item: "i:atlas", resource: SITE };
    ledger.explored(press("save.row", ["modify_existing"], ROW));
    ledger.observed(minePage({ "s:atlas": "v:on" }));
    // A look under `undoes`, and the list still shows the change: the act is still the model's to undo.
    ledger.explored(navigation("go.mine", "act-1"));
    expect(await ledger.beforeTrial(compare)).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1" }] } });
    expect(ledger.target("act-1", { effect: "mutate", consequences: ["modify_existing"], control: ROW })).toEqual({ kind: "admit", on: "own", allowed: [] });
    ledger.explored(press("unsave.row", ["modify_existing"], ROW, { undoes: "act-1", on: "own" }));
    ledger.observed(minePage());
    expect(await ledger.beforeTrial(compare)).toEqual({ kind: "admit" });
    expect(ledger.standing("act-1")).toBe("restored");
  });
});
