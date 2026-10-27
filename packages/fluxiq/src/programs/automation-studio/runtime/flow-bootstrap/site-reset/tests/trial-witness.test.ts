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
  type AutomationStudioSiteResetSpot,
  type AutomationStudioSiteResetTrialAct
} from "../index.ts";

// What a trial act is witnessed by (t751 R3, R6). A trial or entry-preparation act takes its step's stamp, the witness its
// plan node took at submission: a destination ref attaches that issued list, a repeated explored act lends its witnesses.
// Adoption is deleted: a trial act with no stamp and no witness of its own is never judged on lists named for other acts
// (office rerun round 5 `run-mvhibit5-e1d3a4f3`, cause 2); it is to name a list read complete before it, and no call can
// settle it where none was. A lasting act at a place its step read no controls at is a press there (photo round 5).
// Replaces `settlement-adopted.test.ts`, `project-ledger-adoption.test.ts` and `project-ledger-entry-repeats.test.ts`,
// keeping their scenarios under the new model. Made-up fixtures: a recipe box, a finder and a shelf, opaque tokens only.

const SITE = "r:site";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[], group = "g:box"): List => ({ scope, group, subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
const page = (scope: string, location: string, collections?: List[], controls?: Record<string, Record<string, number>>): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope, location, ...(collections ? { collections } : {}), ...(controls ? { controls } : {}) });
const box = () => [list("p:cards", ["s:soup", "s:stew"]), list("p:saved", ["s:pie"])];
const boxPage = (collections = box()) => page("p:box-page", "loc:box", collections);
const finder = () => page("p:finder-page", "loc:finder", [list("p:results", ["s:atlas", "s:primer"], "g:results")]);
const shelf = () => page("p:shelf-page", "loc:shelf", [list("p:shelf", ["s:held"], "g:shelf")]);
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: "Press", kind: "button", ...spot }, verb: "press" }, ...extra });
const look = (callId: string, undoes: string, resetDestination: string): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, undoes, on: "moving", resetDestination, declared: { permitted: true, effect: "observe", consequences: [], control: { name: null, kind: "page" }, verb: "read" } });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
/** A step confirming a choice that sits in no list, run on the box's own page; `witness` its node's stamp. */
const confirmStep = (witness?: unknown): AutomationStudioSiteResetTrialAct => ({ step: 4, definitionId: "demo.confirm", label: "confirm the choice", control: "Use this choice", consequences: ["modify_existing"], spot: { page: "s:review" }, controls: { page: "p:box-page", location: "loc:box", before: {}, after: {} }, ...(witness === undefined ? {} : { witness: witness as NonNullable<AutomationStudioSiteResetTrialAct["witness"]> }) });
const LEFT = `trial step 4 "confirm the choice" on "Use this choice" (${WORDS.leftUnchanged()})`;

it("keeps a destination-stamped project trial strict when its diff reports no control spot", async () => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const own = project.forBrief("builder");
  project.observed(boxPage());
  own.observed(boxPage());
  own.destinationReceipts();
  own.trialRan([{ step: 1, definitionId: "demo.add", consequences: ["create_new"], witness: { via: "destination", ref: "destination-1" } }]);
  expect(own.inPlace()[0]?.settle).toContain("destination-1");
  await own.beforeTrial({ compare });
  expect(await own.beforeTrial({ compare }, ["act-1"])).toMatchObject({ kind: "refuse" });
  own.observed(boxPage());
  expect(own.standing("act-1")).toBe("unchanged");
});

it("retains explicit standalone legacy trial compatibility", async () => {
  const own = new AutomationStudioSiteResetLedger();
  own.trialRan([{ step: 1, definitionId: "demo.add", consequences: ["create_new"], witness: { via: "legacy" } }]);
  await own.beforeTrial({ compare });
  expect(await own.beforeTrial({ compare }, ["act-1"])).toMatchObject({ kind: "admit" });
});

it("retains an own-list original through a missing trial diff", () => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const builder = project.forBrief("builder");
  project.observed(boxPage());
  builder.observed(boxPage());
  builder.destinationReceipts();
  const witness = builder.admitStep({ effect: "mutate", consequences: ["modify_existing"], control: { name: "Edit", kind: "button", resource: SITE, scope: "p:cards", subject: "s:soup", item: "i:soup" } });
  expect(witness).toEqual({ via: "destination", ref: "destination-1" });
  const supervisor = project.forBrief("supervisor");
  supervisor.trialRan([{ step: 1, definitionId: "demo.edit", consequences: ["modify_existing"], witness: witness! }]);
  expect(supervisor.inPlace()[0]?.settle).toContain("destination-1");
  supervisor.observed(boxPage());
  expect(supervisor.standing("act-1")).toBe("unchanged");
});

it.each([false, true])("retains an original control across brief owners without optional trial diff (changed %s)", async (changed) => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const builder = project.forBrief("builder");
  const control = (state: string) => page("p:card", "loc:card", undefined, { "pl:star": { [state]: 1 } });
  const declaration = { effect: "mutate" as const, consequences: ["modify_existing" as const], control: { name: "Star", kind: "button", resource: SITE, subject: "s:card", place: "pl:star", state: "st:off" } };
  builder.observed(control("st:off"));
  // Submission may see exploration's changed state; its original must still be the first pre-act read.
  builder.explored(press("star", ["modify_existing"], declaration.control));
  builder.observed(control("st:on"));
  expect(project.stepWitnessResolves({ via: "repeats", act: "act-1" })).toBe(false);
  const { state: _state, ...sameControl } = declaration.control;
  expect(builder.admitStep({ ...declaration, control: sameControl }, "demo.press")).toEqual({ via: "control", ref: "control-1" });
  expect(builder.admitStep({ ...declaration, control: { ...sameControl, place: "pl:other" } }, "demo.press")).toBeUndefined();
  const witness = builder.admitStep({ ...declaration, control: { ...declaration.control, state: "st:on" } });
  expect(witness).toEqual({ via: "control", ref: "control-1" });
  expect(project.stepWitnessResolves(witness)).toBe(true);
  expect(project.stepWitnessResolves({ via: "control" })).toBe(false);
  expect(project.stepWitnessResolves({ via: "control", ref: "control-9" })).toBe(false);
  const supervisor = project.forBrief("supervisor");
  supervisor.trialRan([{ step: 1, definitionId: "demo.star", consequences: ["modify_existing"], witness: witness! }]);
  expect(supervisor.inPlace()[0]?.settle).toContain("loc:card");
  supervisor.observed(control(changed ? "st:on" : "st:off"));
  if (changed) {
    expect(supervisor.standing("act-2")).toBe("in_place");
    expect(supervisor.claim("act-2")).toMatchObject({ kind: "undo" });
    expect(supervisor.target("act-2", { effect: "mutate", consequences: ["modify_existing"], control: { place: "pl:star", state: "st:on", resource: SITE } })).toMatchObject({ kind: "admit" });
    supervisor.observed(control("st:off"));
  }
  expect(supervisor.standing("act-2")).toBe(changed ? "restored" : "unchanged");
  expect(await supervisor.beforeTrial({ compare })).toMatchObject({ kind: "admit" });
});

// t751 final acceptance (headed photo-toggle, photo-dialog-step, photo-dialog-destination): a place also holds other
// controls, and one view of it (a dialog) shows more of them than another (the item's own page). A trial act stamped
// with the place's original is pressed back on the other view: its own toggle's two states are back at the original's
// counts, and the other controls' counts, which differ only by view, are no effect of the act and never hold it open.
it("settles a control-stamped trial act pressed back on another view of its place by its toggle's own two states", () => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const builder = project.forBrief("builder");
  const dialog = (state: string) => page("p:dialog", "loc:item", undefined, { "pl:star": { [state]: 1, "st:note": 2, "st:pin": 1 } });
  const itemPage = (state: string) => page("p:item", "loc:item", undefined, { "pl:star": { [state]: 1, "st:note": 1 } });
  builder.observed(dialog("st:off"));
  const witness = builder.admitStep({ effect: "mutate", consequences: ["modify_existing"], control: { name: "Star", kind: "button", resource: SITE, subject: "s:item", place: "pl:star", state: "st:off" } });
  expect(witness).toEqual({ via: "control", ref: "control-1" });
  const supervisor = project.forBrief("supervisor");
  supervisor.trialRan([{ step: 1, definitionId: "demo.star", consequences: ["modify_existing"], witness: witness! }]);
  supervisor.observed(dialog("st:on"));
  expect(supervisor.standing("act-1")).toBe("in_place");
  supervisor.observed(itemPage("st:on"));
  // Still on, on that other view, it stays in place: only the act's own two states decide, both ways.
  expect(supervisor.standing("act-1")).toBe("in_place");
  expect(supervisor.target("act-1", { effect: "mutate", consequences: ["modify_existing"], control: { resource: SITE, place: "pl:star", state: "st:on" } })).toMatchObject({ kind: "admit" });
  supervisor.observed(itemPage("st:off"));
  expect(supervisor.standing("act-1")).toBe("restored");
});

// t751 final acceptance (headed photo-dialog-act): every item's control has the same place token, so the original read on
// the explored item is the receipt a looped step carries. A pass that pressed another item is witnessed by that item's
// own control, read just before that pass's press, and is judged only on reads of that item: never the explored one.
it("witnesses a looped pass that pressed another item by that item's own control, never the explored item's", () => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const builder = project.forBrief("builder");
  const item = (scope: string, location: string, state: string) => page(scope, location, undefined, { "pl:star": { [state]: 1, "st:note": 1 } });
  builder.observed(item("p:a", "loc:a", "st:off"));
  const witness = builder.admitStep({ effect: "mutate", consequences: ["modify_existing"], control: { name: "Star", kind: "button", resource: SITE, subject: "s:item", place: "pl:star", state: "st:off" } });
  expect(witness).toEqual({ via: "control", ref: "control-1" });
  const supervisor = project.forBrief("supervisor");
  supervisor.trialRan([{ step: 2, definitionId: "demo.star", consequences: ["modify_existing"], witness: witness!, spot: { place: "pl:star", state: "st:off" }, controls: { page: "p:b", location: "loc:b", before: { "st:off": 1, "st:note": 1 }, after: { "st:on": 1, "st:note": 1 } } }]);
  // Its settle names the item it pressed, not the explored one.
  expect(supervisor.inPlace()[0]?.settle).toContain("loc:b");
  expect(supervisor.inPlace()[0]?.settle).not.toContain("loc:a");
  // The explored item, read untouched, never settles it.
  supervisor.observed(item("p:a", "loc:a", "st:off"));
  expect(supervisor.standing("act-1")).toBe("in_place");
  supervisor.observed(item("p:b", "loc:b", "st:on"));
  expect(supervisor.standing("act-1")).toBe("in_place");
  expect(supervisor.target("act-1", { effect: "mutate", consequences: ["modify_existing"], control: { resource: SITE, place: "pl:star", state: "st:on" } })).toMatchObject({ kind: "admit" });
  supervisor.observed(item("p:b", "loc:b", "st:off"));
  expect(supervisor.standing("act-1")).toBe("restored");
});

it("never settles or infers an inverse from another resource's colliding control tokens", () => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const builder = project.forBrief("builder");
  const read = (resource: string, state: string) => ({ ...page("p:card", "loc:card", undefined, { "pl:star": { [state]: 1 } }), resource });
  builder.observed(read("r:A", "st:off"));
  const witness = builder.admitStep({ effect: "mutate", consequences: ["modify_existing"], control: { name: "Star", kind: "button", resource: "r:A", subject: "s:card", place: "pl:star", state: "st:off" } });
  const supervisor = project.forBrief("supervisor");
  supervisor.trialRan([{ step: 1, definitionId: "demo.star", consequences: ["modify_existing"], witness: witness! }]);
  supervisor.observed(read("r:B", "st:off"));
  expect(supervisor.standing("act-1")).toBe("in_place");
  supervisor.observed(read("r:B", "st:on"));
  const undo = (resource: string) => ({ effect: "mutate" as const, consequences: ["modify_existing" as const], control: { resource, place: "pl:star", state: "st:on" } });
  expect(supervisor.target("act-1", undo("r:B"))).toMatchObject({ kind: "refused" });
  supervisor.observed(read("r:A", "st:on"));
  expect(supervisor.target("act-1", undo("r:B"))).toMatchObject({ kind: "refused" });
  expect(supervisor.target("act-1", undo("r:A"))).toMatchObject({ kind: "admit" });
  supervisor.observed(read("r:A", "st:off"));
  expect(supervisor.standing("act-1")).toBe("restored");
});

it("allows an unrelated resource's first control original after a witnessed collection act", () => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const builder = project.forBrief("builder");
  project.observed(boxPage());
  builder.observed(boxPage());
  builder.destinationReceipts();
  builder.trialRan([{ step: 1, definitionId: "demo.add", consequences: ["create_new"], witness: { via: "destination", ref: "destination-1" } }]);
  builder.observed(page("p:late", "loc:late", undefined, { "pl:late": { "st:off": 1 } }));
  expect(builder.admitStep({ effect: "mutate", consequences: ["modify_existing"], control: { name: "Late", kind: "button", resource: SITE, subject: "s:late", place: "pl:late", state: "st:off" } })).toBeUndefined();
  expect(builder.createBaseline({ effect: "mutate", consequences: ["modify_existing"], control: { name: "Late", kind: "button", resource: SITE, subject: "s:late", place: "pl:late", state: "st:off" } }, undefined)).toMatchObject({ kind: "refused", evidence: { canMeet: "no_call" } });
  const other = { ...page("p:other", "loc:other", undefined, { "pl:star": { "st:off": 1 } }), resource: "r:other" };
  builder.observed(other);
  expect(builder.admitStep({ effect: "mutate", consequences: ["modify_existing"], control: { name: "Star", kind: "button", resource: "r:other", subject: "s:card", place: "pl:star", state: "st:off" } })).toEqual({ via: "control", ref: "control-1" });
});
const looking = (observe: (read: AutomationStudioSiteResetRead) => void, reads: () => Record<string, AutomationStudioSiteResetRead>) => {
  const looked: string[] = [];
  const checks: AutomationStudioSiteResetChecks = { compare, lookAt: async (location) => {
    looked.push(location);
    const read = reads()[location];
    if (read) observe(read);
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

describe("a trial act takes its step's stamp (t751 R3)", () => {
  it("a destination stamp attaches that list: Core's own look settles it unchanged, sticky, told to every later trial's judge", async () => {
    const ledger = boxed();
    expect(ledger.trialRan([confirmStep({ via: "destination", ref: "destination-1" })], "trial.1").map((act) => act.act)).toEqual(["act-1"]);
    const { looked, checks } = looking((read) => ledger.observed(read), () => ({ "loc:box": boxPage() }));
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", did: LEFT }] } });
    expect(looked).toEqual(["loc:box"]);
    expect(ledger.standing("act-1")).toBe("unchanged");
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept" } });
    ledger.trialRan([], "trial.2");
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", did: LEFT }] } });
    expect(looked).toEqual(["loc:box"]);
  });

  it("without a look its stamped list is stale, and it says which list to read again", async () => {
    const ledger = boxed();
    ledger.trialRan([confirmStep({ via: "destination", ref: "destination-1" })], "trial.1");
    const refused = await ledger.beforeTrial(compare);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1" }] } });
    expect(settleOf(refused, "act-1")).toBe("Read destination-1 at loc:box completely again.");
  });

  it("a repeats stamp lends the explored act's witnesses, though the step's definition matches no explored act", async () => {
    const ledger = boxed();
    ledger.explored(press("start-draft", ["create_new"], { subject: "s:bread", page: "s:bread", resource: SITE }, { resetDestination: "destination-2" }));
    const step: AutomationStudioSiteResetTrialAct = { step: 5, definitionId: "demo.other", label: "start the draft", consequences: ["create_new"], spot: { subject: "s:bread", page: "s:bread" }, witness: { via: "repeats", act: "act-1" } };
    ledger.trialRan([step], "trial.1");
    const { looked, checks } = looking((read) => ledger.observed(read), () => ({ "loc:box": boxPage() }));
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }] } });
    expect(looked).toEqual(["loc:box"]);
  });

  it("a stamp that is not one exactly, or a ref never shown, attaches nothing", () => {
    for (const witness of [{ via: "destination", ref: "destination-1", scope: "p:cards" }, { via: "destination", ref: "destination-7" }, "destination-1"]) {
      const ledger = boxed();
      ledger.trialRan([confirmStep(witness)], "trial.1");
      ledger.observed(boxPage());
      expect(ledger.standing("act-1")).toBe("in_place");
    }
  });
});

describe("a trial act with no witness is never adopted onto other lists (t751 R6)", () => {
  it("while a list read before it differs it is to name its list, never to undo there; naming one on a look settles it", async () => {
    const ledger = boxed();
    ledger.trialRan([confirmStep()], "trial.1");
    let current = [list("p:cards", ["s:soup", "s:stew"]), list("p:saved", ["s:pie", "s:other"])];
    const { looked, checks } = looking((read) => ledger.observed(read), () => ({ "loc:box": boxPage(current) }));
    ledger.observed(boxPage(current));
    const refused = await ledger.beforeTrial(checks);
    // No witness: Core has nowhere of its own to look.
    expect(looked).toEqual([]);
    const settle = settleOf(refused, "act-1");
    expect(settle).toContain("Nothing read shows where its effect would be");
    expect(settle).toContain("destination-1 (2 items at loc:box), destination-2 (1 item at loc:box)");
    expect(settle).not.toContain("still differs");
    // The list put back settles nothing on its own: no adoption.
    current = box();
    ledger.observed(boxPage(current));
    expect(ledger.standing("act-1")).toBe("in_place");
    ledger.explored(look("look.box", "act-1", "destination-1"));
    ledger.observed(boxPage(current));
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", did: LEFT }] } });
    expect(ledger.changeSeen("act-1")).toBe(false);
  });

  it("with no list read complete before it no call can settle it; a list read whose ref was never shown can still be named", async () => {
    const closed = new AutomationStudioSiteResetLedger();
    closed.observed(page("p:plain", "loc:plain"));
    closed.trialRan([confirmStep()], "trial.1");
    const closedLooks = looking((read) => closed.observed(read), () => ({}));
    const sealed = await closed.beforeTrial(closedLooks.checks);
    expect(sealed).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", failed: "acts_unsettleable", actsToUndo: [], actsUnsettleable: [{ act: "act-1", failed: "nothing_to_name" }] } });
    expect(closedLooks.looked).toEqual([]);
    const unshown = new AutomationStudioSiteResetLedger();
    unshown.observed(boxPage());
    unshown.trialRan([confirmStep()], "trial.1");
    expect(settleOf(await unshown.beforeTrial(compare), "act-1")).toContain("(no ref has been shown yet)");
  });

  it("leaves explored acts as they were: one with no witness is still asked to name its list", async () => {
    const ledger = boxed();
    ledger.explored(press("start-draft", ["create_new"], { subject: "s:bread", page: "s:bread", resource: SITE }, { resetDestination: "destination-1" }));
    ledger.explored(press("mark", ["modify_existing"], { subject: "s:jam", page: "s:jam", resource: SITE }));
    const { looked, checks } = looking((read) => ledger.observed(read), () => ({ "loc:box": boxPage() }));
    const refused = await ledger.beforeTrial(checks);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-2" }] } });
    expect(settleOf(refused, "act-2")).toContain("name that list's ref as resetDestination on a look that names this act under undoes");
    expect(looked).toEqual(["loc:box"]);
    expect([ledger.standing("act-1"), ledger.standing("act-2")]).toEqual(["unchanged", "in_place"]);
  });
});

describe("a lasting trial act at a place its step read no controls at (t751 R1)", () => {
  it("is a press there: no later read seeds that place's start, so a later toggle there has no baseline", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    const spot = { scope: "p:post", subject: "s:post", page: "s:post", resource: SITE, place: "pl:pin" };
    ledger.trialRan([{ step: 1, definitionId: "demo.press", label: "pin it", consequences: ["modify_existing"], spot }], "trial.1");
    ledger.observed(page("p:post", "loc:post", undefined, { "pl:pin": { "st:on": 1 } }));
    ledger.trialRan([{ step: 1, definitionId: "demo.press", label: "pin it", consequences: ["modify_existing"], spot: { ...spot, state: "st:on" }, controls: { page: "p:post", location: "loc:post", before: { "st:on": 1 }, after: { "st:off": 1 } } }], "trial.2");
    expect(ledger.unsatisfiable().map((act) => [act.act, act.failed])).toContainEqual(["act-2", "no_baseline"]);
  });
});

describe("a project build's entry and trial acts take their stamps (office rounds 3-5)", () => {
  /** A read routed as a running brief's permission gate routes it: the project, then every brief's ledger (the first brief's with a baseline). */
  const routing = (project: AutomationStudioSiteResetProjectLedger) => (read: AutomationStudioSiteResetRead): void => {
    project.observed(read);
    for (const owner of new Set(["brief-1", ...project.snapshot().acts.map((act) => act.owner)])) project.forBrief(owner).observed(read, owner === "brief-1");
  };
  /** Brief-1 read the finder and the shelf complete, each ref shown. */
  const explored = () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const first = project.forBrief("brief-1");
    const refs: string[] = [];
    for (const read of [finder(), shelf()]) {
      routing(project)(read);
      refs.push(...first.destinationReceipts().map((receipt) => receipt.ref));
    }
    expect(refs).toEqual(["destination-1", "destination-2"]);
    return project;
  };
  const confirm = (witness?: unknown): AutomationStudioSiteResetTrialAct => ({ ...confirmStep(witness), step: 2, controls: { page: "p:confirm", location: "loc:confirm", before: {}, after: {} } });
  const CONFIRMED = `trial step 2 "confirm the choice" on "Use this choice" (${WORDS.leftUnchanged()})`;

  it("each brief's entry act stamped with the shelf settles on Core's one look there, and the finder is never looked at", async () => {
    const project = explored();
    for (const brief of ["brief-2", "brief-3", "brief-4"]) project.forBrief(brief).trialRan([confirm({ via: "destination", ref: "destination-2" })], `entry-preparation.${brief}`);
    expect(project.snapshot().acts.map((act) => [act.act, act.owner, act.inPlace])).toEqual([["act-1", "brief-2", true], ["act-2", "brief-3", true], ["act-3", "brief-4", true]]);
    const { looked, checks } = looking(routing(project), () => ({ "loc:shelf": shelf(), "loc:finder": finder() }));
    const reset = automationStudioSiteResetProjectReset({ project, checks: () => checks });
    expect(await reset.beforeTrial(undefined)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: ["act-1", "act-2", "act-3"].map((act) => ({ act, did: CONFIRMED })) } });
    expect(looked).toEqual(["loc:shelf"]);
    expect(project.snapshot().acts.every((act) => !act.inPlace)).toBe(true);
    reset.trialRan([], "whole.1");
    expect(await reset.beforeTrial(undefined)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }, { act: "act-3" }] } });
    expect(looked).toEqual(["loc:shelf"]);
  });

  it("an entry act with no stamp names the lists read before it; in a build that read none, no call can settle it", async () => {
    const project = explored();
    const second = project.forBrief("brief-2");
    second.trialRan([confirm()], "entry-preparation.brief-2");
    expect(second.unsatisfiable()).toEqual([]);
    expect(second.inPlace()[0]?.settle).toContain("destination-1 (2 items at loc:finder), destination-2 (1 item at loc:shelf)");
    const empty = new AutomationStudioSiteResetProjectLedger();
    const entry = empty.forBrief("brief-2");
    entry.trialRan([confirm()], "entry-preparation.brief-2");
    expect(empty.unsatisfiable().map((act) => [act.act, act.owner, act.failed])).toEqual([["act-1", "brief-2", "nothing_to_name"]]);
  });

  it("issuedRefs carries each shown ref's count and where it was read, on the brief's ledger and build-wide", () => {
    const project = explored();
    const issued = [{ ref: "destination-1", count: 2, location: "loc:finder" }, { ref: "destination-2", count: 1, location: "loc:shelf" }];
    expect(project.issuedRefs()).toEqual(issued);
    expect(project.forBrief("brief-1").issuedRefs()).toEqual(issued);
    expect(project.forBrief("brief-2").issuedRefs()).toEqual(issued);
  });
});
