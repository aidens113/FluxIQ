import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

// A trial act with no witness of its own adopts the issued lists it could have
// changed (office rerun round 3, `run-mvgo5xft-25460ba2`: act-12, act-15 and
// act-18, one per trial or entry preparation, each in no list, each needing a
// model look under `undoes` that any list settled; narrowed by t743 to lists
// named for an act of the build and lists read on the act's own page,
// `project-ledger-adoption.test.ts`). Here the step ran on the box's own page.
// Core's own pre-trial look settles it `unchanged` when every adopted list
// holds; a differing adopted list never asks to undo it there. Explored acts
// are as before; with no ref that could ever be issued, no call can settle it.
// Made-up fixtures: a recipe box, opaque tokens only.

const SITE = "r:site";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[], group = "g:box"): List => ({ scope, group, subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
const page = (scope: string, location: string, collections?: List[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope, location, ...(collections ? { collections } : {}) });
const box = () => [list("p:cards", ["s:soup", "s:stew"]), list("p:saved", ["s:pie"])];
const boxPage = (collections = box()) => page("p:box-page", "loc:box", collections);
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, resetDestination?: string): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", ...(resetDestination ? { resetDestination } : {}), declared: { permitted: true, effect: "mutate", consequences, control: { name: "Press", kind: "button", ...spot }, verb: "press" } });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
/** A step confirming a choice that sits in no list, on the box's own page (its step's page location, t743). */
const confirmStep = () => ({ step: 4, definitionId: "demo.confirm", label: "confirm the choice", control: "Use this choice", consequences: ["modify_existing" as const], spot: { page: "s:review" }, controls: { page: "p:box-page", location: "loc:box", before: {}, after: {} } });
const LEFT = `trial step 4 "confirm the choice" on "Use this choice" (${WORDS.leftUnchanged()})`;
const looking = (ledger: AutomationStudioSiteResetLedger, reads: () => Record<string, AutomationStudioSiteResetRead>) => {
  const looked: string[] = [];
  const checks: AutomationStudioSiteResetChecks = { compare, lookAt: async (location) => {
    looked.push(location);
    const read = reads()[location];
    if (read) ledger.observed(read);
  } };
  return { looked, checks };
};
const settleOf = (decision: Awaited<ReturnType<AutomationStudioSiteResetLedger["beforeTrial"]>>, act: string): string => {
  const acts = decision.kind === "refuse" ? decision.evidence.actsToUndo : undefined;
  const found = Array.isArray(acts) ? acts.find((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry) && entry.act === act) : undefined;
  return typeof found === "object" && found !== null && !Array.isArray(found) && typeof found.settle === "string" ? found.settle : "";
};
/** A ledger that read the box complete and was shown both its refs. */
const boxed = (): AutomationStudioSiteResetLedger => {
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.observed(boxPage());
  expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1", "destination-2"]);
  return ledger;
};

describe("a trial act with no witness adopts the build's issued lists", () => {
  it("settles unchanged on Core's own pre-trial look, with no model call under undoes, and is told to every later trial's judge", async () => {
    const ledger = boxed();
    expect(ledger.trialRan([confirmStep()], "trial.1").map((act) => act.act)).toEqual(["act-1"]);
    const { looked, checks } = looking(ledger, () => ({ "loc:box": boxPage() }));
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", did: LEFT }] } });
    expect(looked).toEqual(["loc:box"]);
    expect(ledger.standing("act-1")).toBe("unchanged");
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept" } });
    // Sticky: the next trial makes every read stale, and the act needs no look again.
    ledger.trialRan([], "trial.2");
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", did: LEFT }] } });
    expect(looked).toEqual(["loc:box"]);
  });

  it("without a look the adopted list is stale, and the act says which list to read again, never to name one", async () => {
    const ledger = boxed();
    ledger.trialRan([confirmStep()], "trial.1");
    const refused = await ledger.beforeTrial(compare);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1" }] } });
    expect(settleOf(refused, "act-1")).toBe("Read destination-1 at loc:box completely again.");
  });

  it("stays open with its naming words while an adopted list differs, never asked to undo it there, and settles once the list holds", async () => {
    const ledger = boxed();
    ledger.trialRan([confirmStep()], "trial.1");
    let current = [list("p:cards", ["s:soup", "s:stew"]), list("p:saved", ["s:pie", "s:other"])];
    const { looked, checks } = looking(ledger, () => ({ "loc:box": boxPage(current) }));
    const refused = await ledger.beforeTrial(checks);
    expect(looked).toEqual(["loc:box"]);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1" }] } });
    const settle = settleOf(refused, "act-1");
    expect(settle).toContain("Nothing read shows where its effect would be");
    expect(settle).toContain("destination-1 (2 items at loc:box), destination-2 (1 item at loc:box)");
    expect(settle).not.toContain("still differs");
    expect(settle).not.toContain("undo this act there");
    expect(ledger.standing("act-1")).toBe("in_place");
    // Whatever made the list differ is put back, and the list is read again: the act settles, with no change of its own seen.
    current = box();
    ledger.observed(boxPage(current));
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", did: LEFT }] } });
    expect(looked).toEqual(["loc:box"]);
    expect(ledger.standing("act-1")).toBe("unchanged");
    expect(ledger.changeSeen("act-1")).toBe(false);
  });

  it("with no issued ref keeps today's words, and Core looks at nothing for it", async () => {
    // Sealed with nothing ever read complete: no call can settle it in this build (t743), listed apart, never asked to name a ref.
    const closed = new AutomationStudioSiteResetLedger();
    closed.observed(page("p:plain", "loc:plain"));
    closed.trialRan([confirmStep()], "trial.1");
    const closedLooks = looking(closed, () => ({}));
    const sealed = await closed.beforeTrial(closedLooks.checks);
    expect(sealed).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", failed: "acts_unsettleable", actsToUndo: [], actsUnsettleable: [{ act: "act-1", failed: "nothing_to_name" }] } });
    expect(settleOf(sealed, "act-1")).toBe("");
    expect(closedLooks.looked).toEqual([]);
    // A list read complete whose ref was never shown issues nothing to adopt.
    const unshown = new AutomationStudioSiteResetLedger();
    unshown.observed(boxPage());
    unshown.trialRan([confirmStep()], "trial.1");
    const unshownLooks = looking(unshown, () => ({ "loc:box": boxPage() }));
    const refused = await unshown.beforeTrial(unshownLooks.checks);
    expect(settleOf(refused, "act-1")).toContain("(no ref has been shown yet)");
    expect(unshownLooks.looked).toEqual([]);
  });

  it("leaves explored acts as they were: one with no witness is still asked to name its list", async () => {
    const ledger = boxed();
    ledger.explored(press("start-draft", ["create_new"], { subject: "s:bread", page: "s:bread", resource: SITE }, "destination-1"));
    ledger.explored(press("mark", ["modify_existing"], { subject: "s:jam", page: "s:jam", resource: SITE }));
    const { looked, checks } = looking(ledger, () => ({ "loc:box": boxPage() }));
    const refused = await ledger.beforeTrial(checks);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-2" }] } });
    expect(settleOf(refused, "act-2")).toContain("name that list's ref as resetDestination on a look that names this act under undoes");
    expect(looked).toEqual(["loc:box"]);
    expect([ledger.standing("act-1"), ledger.standing("act-2")]).toEqual(["unchanged", "in_place"]);
  });
});
