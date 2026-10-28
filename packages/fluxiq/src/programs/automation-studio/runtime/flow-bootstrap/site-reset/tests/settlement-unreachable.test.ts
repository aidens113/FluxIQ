import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetProjectLedger,
  automationStudioSiteResetProjectReset,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

// A list Core's own look cannot read again (t743, rerun round 4 photo
// `run-mvgw7320-de416190`): the list named for a press was first read in a view
// shown over another page, and its address, loaded again, opened a different
// document. Core's look never re-stamped it, the act kept a `look` reason
// forever, and no call could meet it. Now such a list is lost for the whole
// build: an act with another witness that holds settles and every later
// trial's judge is told the list could not be read again; an act with no other
// witness is `gate_unsatisfiable`, listed apart, and trials stay refused with
// the honest exit. Made-up fixtures: a recipe box with a starred list, opaque
// tokens only.

const SITE = "r:site";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[], group: string): List => ({ scope, group, subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
const page = (scope: string, location: string, collections?: List[], controls?: Record<string, Record<string, number>>): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope, location, ...(collections ? { collections } : {}), ...(controls ? { controls } : {}) });
/** The starred list as first read: in a view shown over the box page, at that view's own address. */
const overlay = () => page("p:overlay", "loc:overlay", [list("p:starred", ["s:soup"], "g:starred")]);
/** The same address loaded again: a different document, without the starred list. */
const standalone = () => page("p:standalone", "loc:overlay", [list("p:more", ["s:stew"], "g:more")]);
/** The card a star is pressed on, with its star control's state. */
const card = (state: string) => page("p:card", "loc:card", undefined, { "pl:star": { [state]: 1 } });
const STAR: AutomationStudioSiteResetSpot & { name: string } = { name: "Star", scope: "p:card", subject: "s:pie", page: "s:pie", resource: SITE, place: "pl:star", state: "st:off" };
/** A press with no control state of its own: its only witness is the list named for it. */
const KEEP: AutomationStudioSiteResetSpot & { name: string } = { name: "Keep", subject: "s:pie", page: "s:pie", resource: SITE };
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot & { name: string }, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => {
  const { name, ...tokens } = spot;
  return { callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name, kind: "button", ...tokens }, verb: "press" }, ...extra };
};
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot) => ({ effect: "mutate" as const, consequences, control });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
/** Checks whose `lookAt` feeds the read at that location to `observe`, as the caller's start check does; a location with no read answers unread. */
const looking = (observe: (read: AutomationStudioSiteResetRead) => void, reads: Record<string, () => AutomationStudioSiteResetRead>) => {
  const looked: string[] = [];
  const checks: AutomationStudioSiteResetChecks = { compare, lookAt: async (location) => {
    looked.push(location);
    const read = reads[location];
    if (read) observe(read());
  } };
  return { looked, checks };
};
/** What an act still on the site says settles it (t775: the ledger tells it; no trial refusal carries it any more). */
const settleOfOpen = (ledger: Pick<AutomationStudioSiteResetLedger, "inPlace">, act: string): string => ledger.inPlace().find((entry) => entry.act === act)?.settle ?? "";
/** A ledger that read the starred list in its view, was shown its ref, and then read the card. */
const shown = (): AutomationStudioSiteResetLedger => {
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.observed(overlay());
  expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
  ledger.observed(card("st:off"));
  return ledger;
};
/** What a trial starts with when only acts no call can settle remain (t775): they are listed on the site, and it runs. */
const UNSETTLEABLE = (acts: unknown[]) => ({ kind: "admit", startedWith: { acts, instruction: WORDS.startedWith(false) } });

describe("a list Core's own look cannot read again (photo r4)", () => {
  it("a toggle press with a destination its look cannot read settles restored after its toggle undo, and every later judge is told", async () => {
    const ledger = shown();
    ledger.explored(press("star", ["modify_existing"], STAR, { resetDestination: "destination-1" }));
    ledger.observed(card("st:on"));
    const { looked, checks } = looking((read) => ledger.observed(read), { "loc:overlay": standalone });
    // Core's look lands on a page without the starred list: lost, and never a `look` again; the toggle still owes its press back.
    const refused = await ledger.beforeTrial(checks);
    expect(looked).toEqual(["loc:overlay"]);
    expect(refused).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1" }] } });
    expect(settleOfOpen(ledger, "act-1")).toBe("Its control at loc:card still shows the state this act set: press that same control back once, naming this act under undoes.");
    expect(ledger.unsatisfiable()).toEqual([]);
    // The model goes back to the card and presses its own control back.
    ledger.observed(card("st:on"));
    expect(ledger.target("act-1", aim(["modify_existing"], { ...STAR, state: "st:on" }))).toEqual({ kind: "admit", on: "own", allowed: ["modify_existing"] });
    ledger.explored(press("unstar", ["modify_existing"], { ...STAR, state: "st:on" }, { undoes: "act-1", on: "own" }));
    ledger.observed(card("st:off"));
    const told = { act: "act-1", call: "star", did: `press "Star" button (${WORDS.settledAs("restored", ["destination-1"])})` };
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [told] } });
    expect(told.did).toContain("the list named for it (destination-1) could not be read again");
    expect(ledger.standing("act-1")).toBe("restored");
    expect(ledger.inPlace()).toEqual([]);
    // Every later trial's judge is told too, and Core never looks at that address again.
    ledger.trialRan([], "trial.1");
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [told] } });
    expect(looked).toEqual(["loc:overlay"]);
  });

  it("a press whose only witness is that list is gate_unsatisfiable: out of actsToUndo, listed apart, and trials refused with the honest exit", async () => {
    const ledger = shown();
    ledger.explored(press("keep", ["modify_existing"], KEEP, { resetDestination: "destination-1" }));
    const { looked, checks } = looking((read) => ledger.observed(read), { "loc:overlay": standalone });
    const apart = [{ act: "act-1", call: "keep", did: "press \"Keep\" button", reason: "gate_unsatisfiable", failed: "witness_unreachable" }];
    for (let ask = 0; ask < 3; ask += 1) expect(await ledger.beforeTrial(checks)).toEqual(UNSETTLEABLE(apart));
    // One look: lost for good.
    expect(looked).toEqual(["loc:overlay"]);
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.unsatisfiable()).toEqual(apart);
    expect(ledger.standing("act-1")).toBe("unsettleable");
    // cannotUndo never settles it either, and every answer listing the acts to undo lists it apart.
    expect(await ledger.beforeTrial(checks, ["act-1"])).toMatchObject(UNSETTLEABLE(apart));
    expect(ledger.claim("act-9")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act", actsToUndo: [], actsUnsettleable: apart } });
    expect(ledger.target("act-9", aim([], {}))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act", actsUnsettleable: apart } });
  });

  it("a look that answers unread in two separate pre-trial checks loses the list; the first still asks for it", async () => {
    const ledger = shown();
    ledger.explored(press("keep", ["modify_existing"], KEEP, { resetDestination: "destination-1" }));
    const { looked, checks } = looking((read) => ledger.observed(read), {});
    const first = await ledger.beforeTrial(checks);
    expect(settleOfOpen(ledger, "act-1")).toBe("Read destination-1 at loc:overlay completely again.");
    expect(ledger.unsatisfiable()).toEqual([]);
    expect(await ledger.beforeTrial(checks)).toMatchObject(UNSETTLEABLE([{ act: "act-1", failed: "witness_unreachable" }]));
    expect(ledger.unsatisfiable()).toMatchObject([{ act: "act-1", failed: "witness_unreachable" }]);
    expect(looked).toEqual(["loc:overlay", "loc:overlay"]);
  });

  it("a list read fresh at its location behaves as today: it settles the act unchanged, with nothing said of a list unread", async () => {
    const ledger = shown();
    ledger.explored(press("keep", ["modify_existing"], KEEP, { resetDestination: "destination-1" }));
    const { looked, checks } = looking((read) => ledger.observed(read), { "loc:overlay": overlay });
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", did: `press "Keep" button (${WORDS.leftUnchanged()})` }] } });
    expect(looked).toEqual(["loc:overlay"]);
    expect(ledger.standing("act-1")).toBe("unchanged");
  });

  it("is lost for every brief of the build: a later brief's act naming it is never looked for again", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const route = (read: AutomationStudioSiteResetRead): void => {
      project.observed(read);
      for (const owner of new Set([...project.snapshot().acts.map((act) => act.owner), "brief-1"])) project.forBrief(owner).observed(read);
    };
    const first = project.forBrief("brief-1");
    route(overlay());
    expect(first.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    first.explored(press("keep", ["modify_existing"], KEEP, { resetDestination: "destination-1" }));
    const { looked, checks } = looking(route, { "loc:overlay": standalone });
    const reset = automationStudioSiteResetProjectReset({ project, checks: () => checks });
    expect(await reset.beforeTrial(undefined)).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1", failed: "witness_unreachable" }] } });
    const second = project.forBrief("brief-2");
    second.explored(press("keep.again", ["modify_existing"], { ...KEEP, subject: "s:tart", page: "s:tart" }, { resetDestination: "destination-1" }));
    expect(second.unsatisfiable()).toMatchObject([{ act: "act-2", failed: "witness_unreachable" }]);
    const both = await automationStudioSiteResetProjectReset({ project, own: second, checks: () => checks }).beforeTrial(undefined);
    expect(both).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-2" }, { act: "act-1" }] } });
    expect(project.unsatisfiable().map((act) => [act.act, act.owner])).toEqual([["act-1", "brief-1"], ["act-2", "brief-2"]]);
    expect(looked).toEqual(["loc:overlay"]);
  });
});
