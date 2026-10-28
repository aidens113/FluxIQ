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

// L1 reset settlement: one settlement model, regressed against the seven
// shapes the reset failed in (design `l1-reset-settlement.md`, table A-G),
// each rebuilt from its debug's closed evidence with made-up fixtures: a
// reading list and a recipe box, opaque tokens only, none of the realistic
// sites' words. Then the invariants no shape may weaken.

const SITE = "r:site";
type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
const list = (scope: string, subjects: string[], group = "g:box", changed: Record<string, string> = {}): List => ({ scope, group, subjects, states: Object.fromEntries(subjects.map((subject) => [subject, changed[subject] ?? `v:${subject}`])) });
const page = (scope: string, location: string, collections?: List[], controls?: Record<string, Record<string, number>>): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope, location, ...(collections ? { collections } : {}), ...(controls ? { controls } : {}) });
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot & { name?: string }, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => {
  const { name, ...tokens } = spot;
  return { callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: name ?? "Press", kind: "button", ...tokens }, verb: "press" }, ...extra };
};
const look = (callId: string, undoes: string, resetDestination?: string): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, undoes, on: "moving", ...(resetDestination ? { resetDestination } : {}), declared: { permitted: true, effect: "observe", consequences: [], control: { name: null, kind: "page" }, verb: "read" } });
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
const settleOf = (decision: Awaited<ReturnType<AutomationStudioSiteResetLedger["beforeTrial"]>>, key: "actsToUndo" | "actsToRestore", act: string): string => {
  const acts = decision.kind === "refuse" ? decision.evidence[key] : undefined;
  const found = Array.isArray(acts) ? acts.find((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry) && entry.act === act) : undefined;
  return typeof found === "object" && found !== null && !Array.isArray(found) && typeof found.settle === "string" ? found.settle : "";
};

/** The recipe box as the build found it: two lists of one page. */
const box = () => [list("p:cards", ["s:soup", "s:stew"]), list("p:saved", ["s:pie"])];
const boxPage = (collections = box()) => page("p:box-page", "loc:box", collections);
/** A ledger that read the box complete and was shown its refs. */
const boxed = (): AutomationStudioSiteResetLedger => {
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.observed(boxPage());
  expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1", "destination-2"]);
  return ledger;
};
/** A creation from a detail page in no list, admitted against the box's first list. */
const DRAFT: AutomationStudioSiteResetSpot & { name: string } = { name: "Start a draft", subject: "s:bread", page: "s:bread", resource: SITE };

describe("shape A: the failed first attempt and its successful retry (canonical r5)", () => {
  const shelf = (changed: Record<string, string> = {}) => list("p:shelf", ["s:atlas", "s:primer"], "g:list", changed);
  const before = () => [shelf(), list("p:later", ["s:diary"], "g:list")];
  const failed = () => [shelf({ "s:atlas": "v:error:atlas" }), list("p:later", ["s:diary"], "g:list")];
  const moved = () => [list("p:shelf", ["s:primer"], "g:list"), list("p:later", ["s:atlas", "s:diary"], "g:list", { "s:atlas": "v:later:atlas" })];
  const ROW: AutomationStudioSiteResetSpot = { scope: "p:shelf", subject: "s:atlas", item: "i:atlas", resource: SITE };
  const BACK: AutomationStudioSiteResetSpot = { scope: "p:later", subject: "s:atlas", item: "i:atlas-later", resource: SITE };

  it("refuses the claim on the failed attempt unrun, admits the retry's inverse, and settles both on the restored lists", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(page("p:list-page", "loc:list", before()));
    ledger.explored(press("first-attempt", ["modify_existing"], ROW));
    // The site failed it: the row shows an error and stays where it was.
    ledger.observed(page("p:list-page", "loc:list", failed()));
    ledger.explored(press("retry", ["modify_existing"], ROW));
    ledger.placed("act-2", { state: {}, location: "loc:list", changed: ["moved"], collections: { before: failed(), after: moved() } });
    ledger.observed(page("p:list-page", "loc:list", moved()));
    expect(ledger.target("act-1", aim(["modify_existing"], BACK))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unproved", otherActsWithObservedEffect: [{ act: "act-2", call: "retry" }] } });
    expect(ledger.target("act-2", aim(["modify_existing"], BACK))).toEqual({ kind: "admit", on: "subject", allowed: ["modify_existing"] });
    ledger.explored(press("move-back", ["modify_existing"], BACK, { undoes: "act-2", on: "subject" }));
    ledger.observed(page("p:list-page", "loc:list", before()));
    expect(await ledger.beforeTrial(compare)).toEqual({ kind: "admit" });
    expect([ledger.standing("act-1"), ledger.standing("act-2")]).toEqual(["restored", "restored"]);
  });
});

describe("shape B: undos that worked settle at the first ask, without dirty-trial refusals (canonical r6)", () => {
  const setUp = () => {
    const ledger = boxed();
    ledger.explored(press("start-draft", ["create_new"], DRAFT, { resetDestination: "destination-1" }));
    ledger.observed(boxPage([list("p:cards", ["s:soup", "s:stew", "s:bread"]), list("p:saved", ["s:pie"])]));
    ledger.explored(press("failed-pin", ["modify_existing"], { scope: "p:cards", subject: "s:soup", item: "i:soup", resource: SITE }));
    ledger.observed(boxPage([list("p:cards", ["s:soup", "s:stew", "s:bread"]), list("p:saved", ["s:pie"])]));
    const created: AutomationStudioSiteResetSpot = { scope: "p:cards", subject: "s:bread", item: "i:bread", resource: SITE };
    expect(ledger.target("act-1", aim(["delete"], created))).toEqual({ kind: "admit", on: "subject", allowed: ["delete"] });
    // The removal lands, and nothing reads the box after it.
    ledger.explored(press("remove", ["delete"], created, { undoes: "act-1", on: "subject" }));
    return ledger;
  };

  it("without a look of its own the witness is stale, and the act says exactly which list to read again", async () => {
    const refused = await setUp().beforeTrial(compare);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" } });
    expect(settleOf(refused, "actsToUndo", "act-1")).toBe("Read destination-1 at loc:box completely again.");
  });

  it("looks at each stale place once itself, and admits at the first ask", async () => {
    const ledger = setUp();
    const { looked, checks } = looking(ledger, { "loc:box": boxPage() });
    expect(await ledger.beforeTrial(checks)).toEqual({ kind: "admit" });
    expect(looked).toEqual(["loc:box"]);
    expect([ledger.standing("act-1"), ledger.standing("act-2")]).toEqual(["restored", "restored"]);
  });
});

describe("shape C: a creation whose admitted list never shows it (office r1)", () => {
  it("is left unchanged on Core's own look, listed for every later trial's judge, and never pressed for", async () => {
    const ledger = boxed();
    expect(ledger.createBaseline({ effect: "mutate", consequences: ["create_new"], control: { ...DRAFT, kind: "button" } }, "destination-1")).toEqual({ kind: "admit" });
    ledger.explored(press("start-draft", ["create_new"], DRAFT, { resetDestination: "destination-1" }));
    const { looked, checks } = looking(ledger, { "loc:box": boxPage() });
    const decision = await ledger.beforeTrial(checks);
    expect(decision).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", call: "start-draft", did: `press "Start a draft" button (${WORDS.leftUnchanged()})` }] } });
    expect(looked).toEqual(["loc:box"]);
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept", instruction: WORDS.keptAct(true) } });
    expect(ledger.standing("act-1")).toBe("unchanged");
    // Sticky: a trial makes every read stale, but the settled act needs no look again.
    ledger.trialRan([], "trial.1");
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }] } });
    expect(looked).toEqual(["loc:box"]);
  });
});

describe("shape D: presses the site itself failed, from places with no list of their own (job r1)", () => {
  const mine = () => [list("p:mine", ["s:held-a", "s:held-b"], "g:mine"), list("p:mine-old", ["s:held-c"], "g:mine")];
  const minePage = () => page("p:mine-page", "loc:mine", mine());

  it("never touches what the list held before, and settles both on its named list", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(minePage());
    const ref = ledger.destinationReceipts()[0]!.ref;
    ledger.explored(press("save.pane", ["modify_existing"], { subject: "s:atlas", page: "s:results", resource: SITE }, { resetDestination: ref }));
    ledger.explored(press("save.detail", ["modify_existing"], { subject: "s:atlas", page: "s:atlas", resource: SITE }, { resetDestination: ref }));
    // A row saved before the build began is never an undo's, whatever it declares.
    const held: AutomationStudioSiteResetSpot = { scope: "p:mine", subject: "s:held-a", item: "i:held-a", resource: SITE };
    for (const consequences of [["modify_existing"], []] as AutomationStudioActionConsequence[][]) expect(ledger.target("act-1", aim(consequences, held))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unproved" } });
    ledger.observed(minePage());
    expect(await ledger.beforeTrial(compare)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", call: "save.pane" }, { act: "act-2", call: "save.detail" }] } });
    expect(ledger.inPlace()).toEqual([]);
  });
});

describe("shape E: the trial's own act, and the retest after a settling look (office r2)", () => {
  const explored = (ledger: AutomationStudioSiteResetLedger) => {
    ledger.explored(press("start-draft", ["create_new"], DRAFT, { resetDestination: "destination-1" }));
    ledger.observed(boxPage());
  };
  const trialStep = (definitionId: string) => ({ step: 5, definitionId, label: "start the draft", control: "Start a draft", consequences: ["create_new" as const], spot: { subject: "s:bread", page: "s:bread" } });

  it("a trial act repeating an explored act shares its named list, and Core's look settles it with no model work", async () => {
    const ledger = boxed();
    explored(ledger);
    // The explored act settled unchanged, so it is never returned as left (t772 w7, `../leftover.ts`); the trial's own is new.
    expect(ledger.trialRan([trialStep("demo.press")], "trial.1").map((act) => act.act)).toEqual(["act-2"]);
    const { looked, checks } = looking(ledger, { "loc:box": boxPage() });
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2", did: `trial step 5 "start the draft" on "Start a draft" (${WORDS.leftUnchanged()})` }] } });
    expect(looked).toEqual(["loc:box"]);
  });

  it("a trial act repeating nothing has no witness: while a list read before it differs it is asked to name its list, settles on a look naming the ref without a resource, and cannotUndo never settles it", async () => {
    const ledger = boxed();
    explored(ledger);
    // Its step ran on the box's own page, which once let it adopt the lists read there; adoption is deleted (t751 R6).
    ledger.trialRan([{ ...trialStep("demo.other"), controls: { page: "p:box-page", location: "loc:box", before: {}, after: {} } }], "trial.1");
    // One list differs, by whatever cause: with no witness of its own it is never asked to undo there, only to name its list.
    const elsewhere = () => boxPage([list("p:cards", ["s:soup", "s:stew"]), list("p:saved", ["s:pie", "s:tart"])]);
    ledger.observed(elsewhere());
    const refused = await ledger.beforeTrial(compare);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-2" }] } });
    expect(settleOf(refused, "actsToUndo", "act-2")).toContain("name that list's ref as resetDestination on a look that names this act under undoes (lists read complete before this act: destination-1 (2 items at loc:box), destination-2 (1 item at loc:box))");
    expect(settleOf(refused, "actsToUndo", "act-2")).not.toContain("undo this act there");
    const kept = await ledger.beforeTrial(compare, ["act-2"]);
    expect(kept).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_unproved", actsToRestore: [{ act: "act-2" }] } });
    expect(settleOf(kept, "actsToRestore", "act-2")).toContain("resetDestination");
    expect(ledger.claim("act-2")).toMatchObject({ kind: "undo" });
    ledger.explored(look("look.box", "act-2", "destination-1"));
    // The list it names holds, though another of the page still differs.
    ledger.observed(elsewhere());
    expect(await ledger.beforeTrial(compare)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }] } });
    expect(ledger.standing("act-2")).toBe("unchanged");
  });
});

describe("shape F: lists the domain cannot vouch complete issue no ref (job r2)", () => {
  const plain = () => page("p:mine-page", "loc:mine");
  const complete = () => page("p:mine-page", "loc:mine", [list("p:mine", ["s:held-a", "s:held-b"], "g:mine")]);
  const SAVE: AutomationStudioSiteResetSpot = { subject: "s:atlas", page: "s:atlas", resource: SITE };

  it("with no complete list read before the act no call can settle it: listed apart, never asked to name a ref, and cannotUndo does not settle it", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(plain());
    expect(ledger.destinationReceipts()).toEqual([]);
    ledger.explored(press("save", ["modify_existing"], SAVE));
    ledger.observed(plain());
    const refused = await ledger.beforeTrial(compare);
    // Sealed with no ref issued (rerun round 2): no read can issue one, so it is `gate_unsatisfiable` (t743), out of actsToUndo.
    // The permission wrapper now refuses such a press before the seal (`reset-witness.test.ts`); an act after the seal still lands here.
    const unsettleable = { kind: "refuse", evidence: { code: "candidate.trial_reset_required", failed: "acts_unsettleable", canMeet: "no_call", actsToUndo: [], actsUnsettleable: [{ act: "act-1", reason: "gate_unsatisfiable", failed: "nothing_to_name" }] } };
    expect(refused).toMatchObject(unsettleable);
    expect(settleOf(refused, "actsToUndo", "act-1")).toBe("");
    expect(await ledger.beforeTrial(compare, ["act-1"])).toMatchObject(unsettleable);
    // Possibly left, closed as no call can settle it: never `in_place` beside being listed apart (t772 w7).
    expect(ledger.standing("act-1")).toBe("unsettleable");
  });

  it("once the list is reported complete it issues a ref, and the act named against it settles", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(complete());
    const [receipt] = ledger.destinationReceipts();
    expect(receipt).toEqual({ ref: "destination-1", ordinal: 1, count: 2 });
    ledger.explored(press("save", ["modify_existing"], SAVE, { resetDestination: receipt!.ref }));
    ledger.observed(complete());
    expect(await ledger.beforeTrial(compare)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }] } });
  });
});

describe("shape G: a toggle pressed in a dialog, pressed back on the item's own page (photo r2)", () => {
  const LIKE: AutomationStudioSiteResetSpot & { name: string } = { name: "Like", scope: "p:profile", subject: "s:post", page: "s:profile", dialog: "d:post", resource: SITE, place: "pl:like", state: "st:off" };
  const profile = (like: string) => page("p:profile", "loc:profile", undefined, { "pl:like": { [like]: 1 }, "pl:follow": { "st:follow": 1 } });
  const post = (like: string) => page("p:post", "loc:post", undefined, { "pl:like": { [like]: 1 } });
  const OWN_PAGE: AutomationStudioSiteResetSpot = { scope: "p:post", subject: "s:post", resource: SITE, place: "pl:like" };
  const toggled = () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(profile("st:off"));
    ledger.explored(press("like", ["modify_existing"], LIKE));
    ledger.observed(profile("st:on"));
    ledger.observed(post("st:on"));
    return ledger;
  };
  const pressBack = (ledger: AutomationStudioSiteResetLedger) => ledger.explored(press("unlike", [], { ...OWN_PAGE, name: "Unlike", state: "st:on" }, { undoes: "act-1", on: "own" }));

  it("admits its own control at its place, still showing the state it set, with modify_existing unasked, and settles once read back", async () => {
    const ledger = toggled();
    for (const consequences of [[], ["modify_existing"]] as AutomationStudioActionConsequence[][]) expect(ledger.target("act-1", aim(consequences, { ...OWN_PAGE, state: "st:on" }))).toEqual({ kind: "admit", on: "own", allowed: ["modify_existing"] });
    pressBack(ledger);
    ledger.observed(post("st:off"));
    expect(await ledger.beforeTrial(compare)).toEqual({ kind: "admit" });
    expect(ledger.standing("act-1")).toBe("restored");
  });

  // t743: each refusal names its failed condition; one already showing the state the build found is its own code (photo r4 0151).
  it.each([
    ["another-place", "candidate.undo_unproved", "control_elsewhere", "another_page"],
    ["already-back", "candidate.undo_already_back", "already_back", "this_page"],
    ["another-class", "candidate.undo_unproved", "consequence_not_inverse", "this_page"]
  ] as const)("refuses unrun a control at %s", (defect, code, failed, canMeet) => {
    const ledger = toggled();
    const control = defect === "another-place" ? { ...OWN_PAGE, place: "pl:follow", state: "st:follow" } : { ...OWN_PAGE, state: defect === "already-back" ? "st:off" : "st:on" };
    expect(ledger.target("act-1", aim(defect === "another-class" ? ["delete"] : [], control))).toMatchObject({ kind: "refused", evidence: { code, failed, canMeet, condition: WORDS.condition(failed, canMeet) } });
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1"]);
  });

  it("stays open, saying to press it back, while its control still shows the state it set", async () => {
    const ledger = toggled();
    pressBack(ledger);
    // The press landed, but the site kept the state.
    ledger.observed(post("st:on"));
    const refused = await ledger.beforeTrial(compare);
    expect(settleOf(refused, "actsToUndo", "act-1")).toBe("Its control at loc:post still shows the state this act set: press that same control back once, naming this act under undoes.");
  });

  // L1 d7 (photo, headed proof `l1-d6-spec-scripts.md`): in a single-subflow plan the judged run's acts are recorded by the
  // supervisor's ledger, which is told no read until it holds an act, so it never read the trial step's page. The step's
  // controls carry that page's location, as a read carries it beside its scope, so the act still says where its control is.
  const trialStep = (from: string, to: string) => ({ step: 3, definitionId: "demo.press", label: "like the post", control: "Like", consequences: ["modify_existing" as const], spot: { scope: "p:post", subject: "s:post", page: "s:profile", dialog: "d:post", resource: SITE, place: "pl:like", state: from }, controls: { page: "p:post", location: "loc:post", before: { [from]: 1 }, after: { [to]: 1 } } });

  it("a trial act's toggle, in a ledger that read no page of it, names its page, and settles on the read after it is pressed back", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    expect(ledger.trialRan([trialStep("st:off", "st:on")], "trial.1").map((act) => act.act)).toEqual(["act-1"]);
    const refused = await ledger.beforeTrial(compare);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" } });
    // The step's own diff is no read of its place (t751 R2): whatever put it back since, the page is to be read first.
    expect(settleOf(refused, "actsToUndo", "act-1")).toBe("Read the page at loc:post again so its control's state can be seen.");
    // The model reads that page: it still shows the state the act set, so it is to press the same control back under undoes.
    ledger.observed(post("st:on"));
    expect(settleOf(await ledger.beforeTrial(compare), "actsToUndo", "act-1")).toBe("Its control at loc:post still shows the state this act set: press that same control back once, naming this act under undoes.");
    expect(ledger.target("act-1", aim([], { ...OWN_PAGE, state: "st:on" }))).toEqual({ kind: "admit", on: "own", allowed: ["modify_existing"] });
    pressBack(ledger);
    ledger.observed(post("st:off"));
    expect(await ledger.beforeTrial(compare)).toEqual({ kind: "admit" });
    expect(ledger.standing("act-1")).toBe("restored");
  });

  it("a stale trial toggle is looked at on its step's page, though no read of that page reached the ledger", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.trialRan([trialStep("st:off", "st:on")], "trial.1");
    // A later trial's step pressed the same control back: the place is at the build's start, but nothing has read it since.
    ledger.trialRan([trialStep("st:on", "st:off")], "trial.2");
    const { looked, checks } = looking(ledger, { "loc:post": post("st:off") });
    expect(await ledger.beforeTrial(checks)).toEqual({ kind: "admit" });
    expect(looked).toEqual(["loc:post"]);
    expect(ledger.standing("act-1")).toBe("restored");
  });
});

describe("invariants no shape may weaken", () => {
  it("partial, malformed and stale reads of a named list never settle; a fresh complete one does", async () => {
    for (const defect of ["partial", "malformed", "stale"] as const) {
      const ledger = boxed();
      ledger.explored(press("start-draft", ["create_new"], DRAFT, { resetDestination: "destination-1" }));
      if (defect === "partial") ledger.observed(boxPage([list("p:saved", ["s:pie"])]));
      if (defect === "malformed") ledger.observed(boxPage([list("p:cards", ["s:soup", "s:soup"]), list("p:saved", ["s:pie"])]));
      // Stale: the only complete read of it predates the act; a trial or a later lasting press makes any earlier read so.
      if (defect === "stale") ledger.trialRan([], "trial.1");
      const refused = await ledger.beforeTrial(compare);
      expect(settleOf(refused, "actsToUndo", "act-1")).toBe("Read destination-1 at loc:box completely again.");
      ledger.observed(boxPage());
      expect(ledger.standing("act-1")).toBe("unchanged");
    }
  });

  it("cannotUndo never settles a strict act: every trial stays refused, saying what would settle it", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    // A list read complete whose ref was never shown: a ref can still be issued, so the act is to name one (t743).
    ledger.observed(page("p:other-page", "loc:other", [list("p:other", ["s:held-a"], "g:other")]));
    ledger.explored(press("pin", ["modify_existing"], { subject: "s:atlas", page: "s:atlas", resource: SITE }));
    expect(await ledger.beforeTrial(compare)).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" } });
    for (let ask = 0; ask < 3; ask += 1) {
      const refused = await ledger.beforeTrial(compare, ["act-1"]);
      expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_unproved", instruction: WORDS.unprovedReset() } });
      expect(settleOf(refused, "actsToRestore", "act-1")).toMatch(/^Nothing read shows where its effect would be/u);
    }
    expect(ledger.standing("act-1")).toBe("in_place");
  });

  // t751 R2 replaced "a toggle that reverts with no press never settles": the return need not follow a press (office r5).
  it("a toggle settles only on a fresh read of its place at the build's start, whatever put it back", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    const controls = (state: string) => ({ "pl:pin": { [state]: 1 } });
    const PIN: AutomationStudioSiteResetSpot = { scope: "p:card", subject: "s:card", resource: SITE, place: "pl:pin" };
    ledger.observed(page("p:card", "loc:card", undefined, controls("st:off")));
    ledger.explored(press("pin", ["modify_existing"], { ...PIN, state: "st:off" }));
    ledger.observed(page("p:card", "loc:card", undefined, controls("st:on")));
    // A trial makes every read stale: the site's own revert is not seen yet, so nothing settles.
    ledger.trialRan([], "trial.1");
    expect(await ledger.beforeTrial(compare)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }] } });
    // It shows the state it had before, with nothing pressed: a fresh read of its place at the start settles it.
    ledger.observed(page("p:card", "loc:card", undefined, controls("st:off")));
    expect(await ledger.beforeTrial(compare)).toEqual({ kind: "admit" });
    expect(ledger.standing("act-1")).toBe("restored");
    expect(ledger.target("act-1", aim([], { ...PIN, state: "st:off" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_already_back", canMeet: "no_call", actsToUndo: [] } });
  });

  it("an act whose own press is unread never settles on its lists alone; the read of its page decides", async () => {
    const PIN: AutomationStudioSiteResetSpot = { scope: "p:cards", subject: "s:soup", item: "i:soup", resource: SITE, place: "pl:pin", state: "st:off" };
    const pinned = () => {
      const ledger = boxed();
      ledger.observed(page("p:box-page", "loc:box", box(), { "pl:pin": { "st:off": 1 } }));
      ledger.explored(press("pin", ["modify_existing"], PIN));
      return ledger;
    };
    const ledger = pinned();
    const refused = await ledger.beforeTrial(compare);
    expect(settleOf(refused, "actsToUndo", "act-1")).toBe("Read destination-1 at loc:box completely again; read the page at loc:box again so its control's state can be seen.");
    // Core's own look reads the page: the lists are as found, the control flipped.
    const { checks } = looking(ledger, { "loc:box": page("p:box-page", "loc:box", box(), { "pl:pin": { "st:on": 1 } }) });
    expect(settleOf(await ledger.beforeTrial(checks), "actsToUndo", "act-1")).toBe("Its control at loc:box still shows the state this act set: press that same control back once, naming this act under undoes.");
    // A read of its page reporting no controls at all reads the press as showing none: the lists alone decide.
    const blind = pinned();
    blind.observed(boxPage());
    expect(blind.standing("act-1")).toBe("unchanged");
  });

  it("answers where every kind of act stands", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(press("pay", ["move_money"], { subject: "s:order", page: "s:order" }));
    ledger.explored(press("pin", ["modify_existing"], { subject: "s:atlas", page: "s:atlas" }));
    // act-2 has no witness and nothing read before it to name: no call can settle it, and its standing says so (t772 w7).
    expect([ledger.standing("act-1"), ledger.standing("act-2"), ledger.standing("act-9")]).toEqual(["irreversible", "unsettleable", undefined]);
    expect(ledger.unsatisfiable().map((act) => [act.act, act.failed])).toEqual([["act-2", "nothing_to_name"]]);
  });
});
