import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { automationStudioCandidateStartedWithSaid } from "../../candidate/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS, AutomationStudioSiteResetLedger, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetExplored, type AutomationStudioSiteResetPlace, type AutomationStudioSiteResetRead, type AutomationStudioSiteResetSpot } from "../index.ts";

// The ledger as the permission wrapper and the trial gate drive it: what
// becomes an act, which claims it accepts, how an act is found undone or
// kept, and how a trial restarts a phase.

function acted(callId: string, consequences: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetExplored> = {}, spot: AutomationStudioSiteResetSpot = {}): AutomationStudioSiteResetExplored {
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name: "Save", kind: "button", ...spot }, verb: "press" }, ...extra };
}
/** What an undo's control declares to the ledger before it acts (t475). */
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot = {}) => ({ effect: "mutate" as const, consequences, control });
const UNDO = { kind: "undo", undo: { act: "act-1", allowed: [] } };
const back = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: [] });
const unknown = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false });

describe("site reset ledger", () => {
  it("records a landed, permitted, lasting call as an act named by verb, control words and kind, with the call id the model gave it", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    expect(ledger.inPlace()).toEqual([{ act: "act-1", did: "press \"Save\" button", call: "call.1" }]);
    expect(ledger.actOf("call.1")).toBe("act-1");
    expect(ledger.actOf("call.2")).toBeUndefined();
  });

  it("ignores calls that did not land, were not permitted, only looked, or declared nothing lasting", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"], { landed: false }));
    ledger.explored({ ...acted("call.2", ["create_new"]), declared: { permitted: false, effect: "mutate", consequences: ["create_new"], control: { name: null, kind: null }, verb: "press" } });
    ledger.explored({ ...acted("call.3", ["modify_existing"]), declared: { permitted: true, effect: "observe", consequences: ["modify_existing"], control: { name: null, kind: null }, verb: "read" } });
    ledger.explored(acted("call.4", []));
    ledger.explored({ callId: "call.5", toolId: "core.run_node", landed: true });
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused" });
  });

  it("withholds a control name the gate withheld", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored({ ...acted("call.1", ["delete"]), declared: { permitted: true, effect: "mutate", consequences: ["delete"], control: { name: null, kind: "link" }, verb: "press" } });
    expect(ledger.inPlace()).toEqual([{ act: "act-1", did: "press link", call: "call.1" }]);
  });

  it("grants nothing unasked on a claim: what an undo may do is decided per control (t475)", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored(acted("call.2", ["modify_existing"]));
    expect(ledger.claim("act-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: [] } });
    expect(ledger.claim("act-2")).toEqual({ kind: "undo", undo: { act: "act-2", allowed: [] } });
    expect(ledger.claim(undefined)).toEqual({ kind: "none" });
  });

  it("allows removing unasked only the item the act created, proven by its own page (t475)", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.add", ["create_new"], {}, { item: "page-add" }));
    ledger.placed("act-1", { state: {}, location: "https://site.test/basket", changed: ["new: line added"], created: ["line:added"] });
    expect(ledger.target("act-1", aim(["delete"], { item: "line:added" }))).toEqual({ kind: "admit", on: "created", allowed: ["delete"] });
    // The act's own control and its item: admitted, nothing unasked.
    expect(ledger.target("act-1", aim(["delete"], { item: "page-add" }))).toEqual({ kind: "admit", on: "own", allowed: [] });
    // A move with nothing lasting and no item, and a look anywhere.
    expect(ledger.target("act-1", aim([]))).toEqual({ kind: "admit", on: "moving", allowed: [] });
    expect(ledger.target("act-1", { effect: "observe", consequences: [], control: { item: "line:before" } })).toEqual({ kind: "admit", on: "moving", allowed: [] });
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1"]);
  });

  it("refuses an undo on another item's control, and keeps the act at that first refusal (t475)", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.confirm", ["modify_existing"], {}, { item: "row:amara" }));
    for (const control of [{ item: "row:tom" }, { item: "row:amara", dialog: "dialog:other" }, {}]) {
      const fresh = new AutomationStudioSiteResetLedger();
      fresh.explored(acted("call.confirm", ["modify_existing"], {}, { item: "row:amara" }));
      const refused = fresh.target("act-1", aim(["delete"], control));
      expect(refused).toMatchObject({ kind: "refused", evidence: { ok: false, code: "candidate.undo_wrong_target", act: "act-1", cannotUndo: [{ act: "act-1" }] } });
      expect(fresh.inPlace()).toEqual([]);
      expect(fresh.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept" } });
    }
    // Declaring nothing lasting does not make another row's control an undo.
    expect(ledger.target("act-1", aim([], { item: "row:tom" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target" } });
  });

  // Lane B round 11 (`run-mv5yaapd-ad19eaae`): an Add to cart in no row, undone by Remove on the cart's only line -- the
  // soap the cart held before the build -- because a one-line list names no row and two missing items compared equal.
  it("admits an undo on the act's own item only on a positive match: a token missing on either side never matches (t479)", async () => {
    const unmatched: Array<[AutomationStudioSiteResetSpot, AutomationStudioSiteResetSpot]> = [
      [{}, {}],
      [{}, { item: "line:soap" }],
      [{ item: "page-add" }, {}],
      [{ dialog: "dialog:cart" }, { dialog: "dialog:cart" }],
      [{ item: "row:a" }, { item: "row:a", dialog: "dialog:x" }],
      [{ item: "row:a", dialog: "dialog:x" }, { item: "row:a" }]
    ];
    for (const [spot, control] of unmatched) {
      for (const consequences of [["modify_existing"], ["delete"]] as AutomationStudioActionConsequence[][]) {
        const ledger = new AutomationStudioSiteResetLedger();
        ledger.explored(acted("call.add", ["create_new"], {}, spot));
        expect(ledger.target("act-1", aim(consequences, control))).toMatchObject({ kind: "refused", evidence: { ok: false, code: "candidate.undo_wrong_target", act: "act-1", cannotUndo: [{ act: "act-1" }] } });
        // No positively identified reverse: the act is kept, and the trial runs with it, saying so.
        expect(ledger.inPlace()).toEqual([]);
        expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }] } });
      }
    }
    // Present and equal, in the same dialog or in none: the act's own item.
    for (const spot of [{ item: "row:a" }, { item: "row:a", dialog: "dialog:x" }]) {
      const ledger = new AutomationStudioSiteResetLedger();
      ledger.explored(acted("call.confirm", ["modify_existing"], {}, spot));
      expect(ledger.target("act-1", aim(["modify_existing"], { ...spot }))).toEqual({ kind: "admit", on: "own", allowed: [] });
    }
  });

  it("follows an undo with one lasting press in a dialog only: the site's one confirmation spends the chain (t479)", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.confirm", ["modify_existing"], {}, { item: "row:amara" }));
    expect(ledger.target("act-1", aim(["modify_existing"], { item: "row:amara" }))).toMatchObject({ kind: "admit", on: "own" });
    ledger.explored(acted("call.undo", ["modify_existing"], { undoes: "act-1", on: "own" }));
    // An acknowledgement that changes nothing lasting does not spend it.
    expect(ledger.target("act-1", aim([], { dialog: "dialog:confirm" }))).toEqual({ kind: "admit", on: "follow_up", allowed: [] });
    ledger.explored(acted("call.ok", [], { undoes: "act-1", on: "follow_up" }));
    expect(ledger.target("act-1", aim(["modify_existing"], { dialog: "dialog:confirm" }))).toEqual({ kind: "admit", on: "follow_up", allowed: [] });
    ledger.explored(acted("call.yes", ["modify_existing"], { undoes: "act-1", on: "follow_up" }));
    // A second lasting press in a dialog -- another line of an open drawer -- is not that undo's confirmation.
    expect(ledger.target("act-1", aim(["modify_existing"], { dialog: "dialog:drawer" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target" } });
  });

  it("admits a dialog the site opens to confirm an undo only after that undo landed on the act's own or created item (t475)", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.add", ["create_new"]));
    ledger.placed("act-1", { state: {}, location: "https://site.test/basket", changed: ["new: line"], created: ["line:added"] });
    ledger.explored(acted("call.add.2", ["create_new"]));
    // Before any undo of act-2 landed, a dialog control is not tied to it.
    expect(ledger.target("act-2", aim(["delete"], { dialog: "dialog:confirm" }))).toMatchObject({ kind: "refused" });
    expect(ledger.target("act-1", aim(["delete"], { item: "line:added" }))).toMatchObject({ kind: "admit", on: "created" });
    ledger.explored(acted("call.remove", [], { undoes: "act-1", on: "created" }));
    expect(ledger.target("act-1", aim(["delete"], { dialog: "dialog:confirm" }))).toEqual({ kind: "admit", on: "follow_up", allowed: ["delete"] });
    ledger.explored(acted("call.yes", ["delete"], { undoes: "act-1", on: "follow_up" }));
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_already_done", undoneBy: "call.yes" } });
  });

  it("keeps an act whose undo the gate refused, at once (t475)", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.confirm", ["modify_existing"], {}, { item: "row:amara" }));
    ledger.explored({ ...acted("call.undo", ["delete"], { undoes: "act-1", on: "own", landed: false }), declared: { permitted: false, effect: "mutate", consequences: ["delete"], control: { name: "Delete", kind: "button", item: "row:amara" }, verb: "press" } });
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept" } });
  });

  it("forgets an act whose page showed nothing of it (t475)", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.add", ["create_new"]));
    ledger.noEffect("act-1");
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
    expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
  });

  // Lane B round 11 (`run-mv5yaapd-ad19eaae`): after the hook, a look on each act's own page still saw a rotating
  // carousel and a chat card's cover, the model was asked to undo them, and it removed the soap instead.
  it("after a start hook, counts every act undone, kept ones too, and asks the model for nothing, whatever a look would still see (t479)", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["modify_existing"]));
    ledger.placed("act-1", { state: { page: "a" }, location: "https://site.test/a", changed: ["h1 slide 2"] });
    ledger.explored(acted("call.2", ["create_new"]));
    ledger.placed("act-2", { state: { page: "b" }, location: "https://site.test/b", changed: ["clickable + covered-by t9"] });
    ledger.explored(acted("call.3", ["modify_existing"], {}, { item: "row:a" }));
    ledger.target("act-3", aim(["delete"], { item: "row:b" }));
    ledger.explored(acted("call.4", ["send_or_publish"]));
    ledger.trialRan([{ step: 1, definitionId: "demo.press", consequences: ["create_new"] }], "trial.1");
    let looked = 0;
    const checks = {
      compare: async () => {
        looked += 1;
        return { moved: true, differs: ["h1 slide 2"] };
      },
      compareAt: async () => {
        looked += 1;
        return { moved: true, differs: ["h1 slide 2", "clickable + covered-by t9"] };
      }
    };
    // Every act the hook took back is answered, kept ones too; the act no control takes back (act-4) is not the hook's to absorb (t504).
    expect(await ledger.beforeTrial(checks, undefined, { startReset: true })).toEqual({ kind: "admit", absorbedByStartReset: [
      { act: "act-1", did: "press \"Save\" button", call: "call.1", control: "Save" },
      { act: "act-2", did: "press \"Save\" button", call: "call.2", control: "Save" },
      { act: "act-3", did: "press \"Save\" button", call: "call.3", control: "Save" },
      { act: "act-5", did: "trial step 1 demo.press" }
    ] });
    expect(looked).toBe(0);
    expect(ledger.inPlace()).toEqual([]);
    for (const act of ["act-1", "act-2", "act-3", "act-5"]) expect(ledger.claim(act)).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
    // A later act made after the hook is the reset's again, without a hook.
    ledger.explored(acted("call.6", ["create_new"]));
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-6" }] } });
    // Only what was still on the site: the acts the first hook took back are not answered twice.
    expect(await ledger.beforeTrial(checks, undefined, { startReset: true })).toEqual({ kind: "admit", absorbedByStartReset: [{ act: "act-6", did: "press \"Save\" button", call: "call.6", control: "Save" }] });
    // A hook with nothing of the build on the site says nothing.
    expect(await ledger.beforeTrial(checks, undefined, { startReset: true })).toEqual({ kind: "admit" });
  });

  // Lane D round 17 (`run-mv6lgt3s-c3aa6fac`): an exploration press acted on the wrong row of a list, became act-1,
  // and the Lab's start hook then marked it undone with no record: no trial evidence and no run record said it existed.
  it("names each exploration act a start hook absorbed, with what it did and the call that made it, and never one the model already undid (t504)", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.archive", ["modify_existing"], {}, { item: "row:1" }));
    ledger.placed("act-1", { state: { page: "inbox" }, location: "https://site.test/inbox", changed: ["row 1 archived"] });
    ledger.explored(acted("call.label", ["create_new"]));
    ledger.placed("act-2", { state: { page: "inbox" }, location: "https://site.test/inbox", changed: ["label added"] });
    // The model undid act-2 itself, and its page no longer shows it.
    ledger.explored(acted("call.unlabel", ["delete"], { undoes: "act-2" }));
    const compareAt = async (place: AutomationStudioSiteResetPlace): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: place.changed.includes("row 1 archived") ? ["row 1 archived"] : [] });
    expect(await ledger.beforeTrial({ compare: back, compareAt })).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }] } });
    const decision = await ledger.beforeTrial({ compare: back, compareAt }, undefined, { startReset: true });
    expect(decision).toEqual({ kind: "admit", absorbedByStartReset: [{ act: "act-1", did: "press \"Save\" button", call: "call.archive", control: "Save" }] });
  });

  it("refuses a claim on an unknown act, a malformed value, or an act that cannot be undone, listing the acts that may be", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored(acted("call.2", ["move_money"]));
    ledger.explored(acted("call.3", ["send_or_publish", "create_new"]));
    for (const undoes of ["act-9", 7, "act-2", "act-3", null]) {
      const claim = ledger.claim(undoes);
      expect(claim.kind).toBe("refused");
      if (claim.kind !== "refused") continue;
      expect(claim.evidence).toMatchObject({ ok: false, code: "candidate.undo_unknown_act", actsToUndo: [{ act: "act-1", did: "press \"Save\" button", call: "call.1" }] });
      expect(String(claim.evidence.instruction)).toContain("actsToUndo");
    }
    // Acts that cannot be undone are never demanded.
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1"]);
  });

  it("never counts an act undone because an undo of it landed: it is undone once its own page no longer shows what it changed (t471)", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.placed("act-1", { state: { page: "item" }, location: "https://site.test/item", changed: ["new: 2 in basket"] });
    ledger.explored(acted("call.undo", ["delete"], { undoes: "act-1" }));
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1"]);
    // Its page still shows the change: refused, naming what is still there.
    const looked: AutomationStudioSiteResetPlace[] = [];
    const compareAt = async (place: AutomationStudioSiteResetPlace): Promise<AutomationStudioSiteResetComparison> => {
      looked.push(place);
      return { moved: true, differs: ["new: 2 in basket"] };
    };
    const still = await ledger.beforeTrial({ compare: back, compareAt });
    expect(still).toMatchObject({ kind: "refuse", moved: true, evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1", stillThere: ["new: 2 in basket"] }] } });
    expect(looked).toEqual([{ state: { page: "item" }, location: "https://site.test/item", changed: ["new: 2 in basket"] }]);
    // Gone from its page: undone, and the trial runs.
    expect(await ledger.beforeTrial({ compare: back, compareAt: async () => ({ moved: true, differs: [] }) })).toEqual({ kind: "admit" });
    expect(ledger.inPlace()).toEqual([]);
  });

  it("keeps no place for an act that changed nothing on its page", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.placed("act-1", { state: { page: "item" }, location: "https://site.test/item", changed: [] });
    ledger.placed("act-9", { state: { page: "item" }, location: "https://site.test/item", changed: ["x"] });
    expect(ledger.inPlace()).toEqual([{ act: "act-1", did: "press \"Save\" button", call: "call.1" }]);
  });

  it("spends an act's one unasked removal only on a landed undo that declared delete, then refuses naming it again (t471)", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    // Going to the page the line is on, under the act, spends nothing.
    ledger.explored(acted("call.go", [], { undoes: "act-1", on: "moving" }));
    expect(ledger.claim("act-1")).toEqual(UNDO);
    ledger.explored(acted("call.undo", ["delete"], { undoes: "act-1", on: "created" }));
    const claim = ledger.claim("act-1");
    expect(claim).toMatchObject({ kind: "refused", evidence: { ok: false, code: "candidate.undo_already_done", act: "act-1", undoneBy: "call.undo", actsToUndo: [] } });
    if (claim.kind === "refused") expect(String(claim.evidence.instruction)).toContain("Positive original-state evidence is checked before the next trial");
  });

  it("leaves an act's removal unspent when the undo only looked, put nothing to the gate, or removed on its own item rather than a created one", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored({ ...acted("call.look", ["delete"], { undoes: "act-1" }), declared: { permitted: true, effect: "observe", consequences: [], control: { name: null, kind: null }, verb: "read" } });
    ledger.explored({ callId: "call.bare", toolId: "core.run_node", undoes: "act-1", landed: true });
    ledger.explored(acted("call.own", ["delete"], { undoes: "act-1", on: "own" }));
    expect(ledger.claim("act-1")).toEqual(UNDO);
  });

  it("counts an act with no page of its own undone only when an undo of it changed the page it ran on and stayed there", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.trialRan([{ step: 2, definitionId: "demo.press", label: "Keep it", consequences: ["modify_existing"] }, { step: 3, definitionId: "demo.press", label: "Keep it", consequences: ["modify_existing"] }], "trial.1");
    // act-1: a click on words that changed nothing. act-2: a press that changed its page.
    ledger.explored(acted("click.words", [], { undoes: "act-1" }));
    ledger.undoSeen("act-1", false);
    ledger.explored(acted("press.back", ["modify_existing"], { undoes: "act-2" }));
    ledger.undoSeen("act-2", true);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }] } });
  });

  it("counts a landed undo as before where the target cannot be read at all", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored(acted("call.undo", ["delete"], { undoes: "act-1" }));
    expect(await ledger.beforeTrial(unknown)).toEqual({ kind: "admit" });
  });

  // F1 continuation: no progress never admits a trial on leftovers; only the model's word that the site cannot undo it does.
  it("refuses the trial while an act the reset made no progress on is still there, runs it once the act is named under cannotUndo, and every later trial says so", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["modify_existing"]));
    ledger.placed("act-1", { state: { page: "a" }, location: "https://site.test/a", changed: ["new: \"Done\""] });
    const there = { compare: back, compareAt: async () => ({ moved: true, differs: ["new: \"Done\""] }) };
    expect(await ledger.beforeTrial(there)).toMatchObject({ kind: "refuse" });
    ledger.explored(acted("click.words", [], { undoes: "act-1" }));
    // The same act still there, the same way: no progress, and the trial is refused all the same.
    for (let ask = 0; ask < 4; ask += 1) expect(await ledger.beforeTrial(there)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1", stillThere: ["new: \"Done\""] }] } });
    const ran = await ledger.beforeTrial(there, ["act-1"]);
    expect(ran).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", did: "press \"Save\" button" }] } });
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept", act: "act-1" } });
    ledger.trialRan([], "trial.1");
    expect(await ledger.beforeTrial(there)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }] } });
  });

  it("keeps an act still there after the reset asked for it, though other acts were undone between, only once the model names it", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["modify_existing"]));
    ledger.placed("act-1", { state: { page: "a" }, location: "https://site.test/a", changed: ["new: kept"] });
    ledger.explored(acted("call.2", ["modify_existing"]));
    ledger.placed("act-2", { state: { page: "b" }, location: "https://site.test/b", changed: ["new: gone later"] });
    let secondThere = true;
    const checks = { compare: back, compareAt: async (place: AutomationStudioSiteResetPlace) => ({ moved: true, differs: place.location.endsWith("/a") ? ["new: kept"] : secondThere ? ["new: gone later"] : [] }) };
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }, { act: "act-2" }] } });
    secondThere = false;
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }] } });
    // Asked for twice and still there is no proof the site cannot undo it: refused until the model says so.
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }] } });
    expect(await ledger.beforeTrial(checks, ["act-1"])).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }] } });
  });

  it("keeps an act the model says cannot be undone, but only once the reset has asked for it", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["modify_existing"]));
    expect(await ledger.beforeTrial(back, ["act-1"])).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }] } });
    expect(await ledger.beforeTrial(back, ["act-1", "act-9"])).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }] } });
  });

  // Lane D round 9 (`run-mv5q4j2n-25784472`): three requests confirmed; no control takes a confirmation back, and the
  // model clicked the words that replaced a Confirm button under `undoes`. The page the build began on shows nothing
  // of the requests, so the start comparison is clean throughout.
  it("lane D's sequence: three confirms no control undoes; once named so, the trial runs with them, and every later trial says so", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    for (const n of [1, 2, 3]) {
      ledger.explored(acted(`confirm-${n}`, ["modify_existing"]));
      ledger.placed(`act-${n}`, { state: { page: "requests" }, location: "https://site.test/requests", changed: [`gone: button "Confirm" ${n}`, `new: "Request accepted" ${n}`],
        lines: { gone: [`button "Confirm" ${n}`], added: [`"Request accepted" ${n}`] } });
    }
    const everyRow = { gone: [1, 2, 3].map((n) => `button "Confirm" ${n}`), added: [1, 2, 3].map((n) => `"Request accepted" ${n}`) };
    const requests = { compare: back, compareAt: async () => ({ moved: true, differs: ["(worded)"], lines: everyRow }) };
    expect(await ledger.beforeTrial(requests)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1", stillThere: ["\"Request accepted\" 1", "button \"Confirm\" 1"] }, { act: "act-2" }, { act: "act-3" }] } });
    ledger.explored(acted("click-words", [], { undoes: "act-1" }));
    ledger.undoSeen("act-1", false);
    // A clean start page and a landed click vouch for nothing; no progress is refused again, until the model says no control undoes them.
    expect(await ledger.beforeTrial(requests)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }, { act: "act-2" }, { act: "act-3" }] } });
    expect(await ledger.beforeTrial(requests, ["act-1", "act-2", "act-3"])).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }, { act: "act-3" }] } });
    ledger.trialRan([], "trial.1");
    expect(await ledger.beforeTrial(requests)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }, { act: "act-3" }] } });
  });

  // Lane B round 9 (`run-mv5q4j33-d04ac463`): two lines added to a basket that already held one, both removed, the
  // second declaring delete; the line that was there before is never removed unasked.
  it("lane B's sequence: two adds that each change one basket total, both removed once each unasked, and the earlier line is never an act's", async () => {
    const site = { lines: ["soap"] };
    const total = () => `basket: ${site.lines.join(",")}`;
    const ledger = new AutomationStudioSiteResetLedger();
    const add = (call: string, act: string, item: string) => {
      ledger.explored(acted(call, ["create_new"]));
      const before = total();
      site.lines.push(item);
      ledger.placed(act, { state: { total: before }, location: `https://site.test/${item}`, changed: [`gone: ${before}`, `new: ${total()}`], lines: { gone: [before], added: [total()] } });
    };
    add("add-first", "act-1", "first");
    add("add-second", "act-2", "second");
    const checks = {
      compare: back,
      compareAt: async (place: AutomationStudioSiteResetPlace) => {
        const was = String(place.state.total), now = total();
        return was === now ? { moved: true, differs: [], lines: { gone: [], added: [] } } : { moved: true, differs: [`gone: ${was}`, `new: ${now}`], lines: { gone: [was], added: [now] } };
      }
    };
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }, { act: "act-2" }] } });
    ledger.explored(acted("go-to-basket", [], { undoes: "act-1", on: "moving" }));
    expect(ledger.claim("act-2")).toEqual({ kind: "undo", undo: { act: "act-2", allowed: [] } });
    ledger.explored(acted("remove-second", ["delete"], { undoes: "act-2", on: "created" }));
    site.lines.pop();
    // Only the second line removed: the first act's line is still there, the second's is gone.
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1", stillThere: ["basket: soap,first", "basket: soap"] }] } });
    expect(ledger.claim("act-1")).toEqual(UNDO);
    ledger.explored(acted("remove-first", ["delete"], { undoes: "act-1", on: "created" }));
    site.lines.pop();
    // The earlier line, named under either act, is refused unrun.
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_already_done", undoneBy: "remove-first" } });
    expect(await ledger.beforeTrial(checks)).toEqual({ kind: "admit" });
    expect(site.lines).toEqual(["soap"]);
  });

  it("numbers acts once and never reuses a number, the trial's own acts included", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored(acted("call.2", ["create_new"]));
    ledger.explored(acted("undo.1", ["delete"], { undoes: "act-1" }));
    ledger.explored(acted("undo.2", ["delete"], { undoes: "act-2" }));
    expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
    const left = ledger.trialRan([{ step: 3, definitionId: "demo.press", label: "Keep it", control: "Save", consequences: ["create_new"] }, { step: 4, definitionId: "demo.pay", consequences: ["move_money"] }], "trial.1");
    expect(left).toEqual([{ act: "act-3", did: "trial step 3 \"Keep it\" on \"Save\"" }]);
    ledger.explored(acted("call.3", ["modify_existing"]));
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-3", "act-5"]);
    expect(ledger.claim("act-3")).toEqual({ kind: "undo", undo: { act: "act-3", allowed: [] } });
  });

  it("is not due before any act, so the trial runs without a comparison", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    let compared = 0;
    const compare = async (): Promise<AutomationStudioSiteResetComparison> => {
      compared += 1;
      return { moved: true, differs: ["x"] };
    };
    expect(await ledger.beforeTrial(compare)).toEqual({ kind: "admit" });
    expect(compared).toBe(0);
  });

  it("refuses a trial on an unread act's leftovers until it is named as one the site cannot undo, then keeps it before every trial", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    const left = { act: "act-1", did: "press \"Save\" button", call: "call.1" };
    ledger.explored(acted("call.1", ["create_new"]));
    expect(await ledger.beforeTrial(unknown)).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" } });
    expect(await ledger.beforeTrial(unknown)).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [left] } });
    expect(await ledger.beforeTrial(unknown, ["act-1"])).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [left] } });
    expect(ledger.trialRan([], "trial.1")).toEqual([left]);
    // Nothing new was recorded, but the act is still in place: the next trial is due all the same, and runs with it kept.
    expect(await ledger.beforeTrial(unknown)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [left] } });
  });

  it("no longer marks every act undone because the start page is as the build found it (t471)", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored(acted("call.2", ["modify_existing"]));
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }, { act: "act-2" }] } });
  });
});

// t593, A8 crossborder `run-mv8c76i3-61b9ca89`: a coupon press declared `none`, stayed done on the site, and nothing named it.
describe("a press with an effect but no lasting class (t593)", () => {
  /** A press on a named control that declared nothing lasting, and a navigation, which names no control. */
  const coupon = () => acted("press.coupon", [], {}, {});
  const navigation = (): AutomationStudioSiteResetExplored => ({ callId: "go.1", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: [], control: { name: null, kind: "page" }, verb: "go to" } });

  it("is recorded as possibly lasting where the ledger is asked to, and never by default", () => {
    const plain = new AutomationStudioSiteResetLedger();
    plain.explored(coupon());
    expect(plain.possiblyInPlace()).toEqual([]);
    expect(plain.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });

    const ledger = new AutomationStudioSiteResetLedger({ possible: true });
    ledger.explored(navigation());
    ledger.explored(coupon());
    // The navigation named no control and is no act; the press is act-1, possibly lasting, and never one to undo.
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.possiblyInPlace()).toEqual([{ act: "act-1", did: "press \"Save\" button (declared no lasting act, but had an effect: possibly lasting)", call: "press.coupon", possible: true }]);
    expect(ledger.actOf("press.coupon")).toBe("act-1");
  });

  it("refuses no trial and is never kept, however often the reset asks; a trial's possibly lasting step is recorded too, and not answered as left", async () => {
    const ledger = new AutomationStudioSiteResetLedger({ possible: true });
    ledger.explored(coupon());
    for (let ask = 0; ask < 3; ask += 1) expect(await ledger.beforeTrial({ compare: unknown })).toEqual({ kind: "admit" });
    const left = ledger.trialRan([{ step: 4, definitionId: "demo.press", label: "Get coupons", consequences: [], possible: true }, { step: 5, definitionId: "demo.press", label: "Look", consequences: [] }], "trial.1");
    expect(left).toEqual([]);
    expect(ledger.possiblyInPlace().map((act) => act.act)).toEqual(["act-1", "act-2"]);
    expect(ledger.possiblyInPlace()[1]).toMatchObject({ did: "trial step 4 \"Get coupons\" (declared no lasting act, but had an effect: possibly lasting)", possible: true });
  });

  it("may still be undone under `undoes`, judged as any undo is, and a start hook takes it back without naming it", async () => {
    const ledger = new AutomationStudioSiteResetLedger({ possible: true });
    ledger.explored(acted("press.coupon", [], {}, { item: "card:coupon" }));
    ledger.explored(acted("press.other", [], {}, {}));
    // The model undoes the first: the claim and its control are admitted as any act's, and a landed undo that changed the page counts.
    expect(ledger.claim("act-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: [] } });
    // A press with nothing lasting and no item is admitted `moving`: a look (L1 build repeats), never an undo, however its page changed.
    expect(ledger.target("act-1", aim([]))).toEqual({ kind: "admit", on: "moving", allowed: [] });
    ledger.explored(acted("look.coupon", [], { undoes: "act-1", on: "moving" }));
    ledger.undoSeen("act-1", true);
    expect(await ledger.beforeTrial({ compare: unknown })).toEqual({ kind: "admit" });
    expect(ledger.possiblyInPlace().map((act) => act.act)).toEqual(["act-1", "act-2"]);
    // Its own item's control undoes it.
    expect(ledger.target("act-1", aim([], { item: "card:coupon" }))).toEqual({ kind: "admit", on: "own", allowed: [] });
    ledger.explored(acted("undo.coupon", [], { undoes: "act-1", on: "own" }, { item: "card:coupon" }));
    ledger.undoSeen("act-1", true);
    expect(await ledger.beforeTrial({ compare: unknown })).toEqual({ kind: "admit" });
    expect(ledger.possiblyInPlace().map((act) => act.act)).toEqual(["act-2"]);
    // The hook puts the rest back, naming only a lasting act among those it took back.
    ledger.explored(acted("call.save", ["create_new"]));
    expect(await ledger.beforeTrial({ compare: unknown }, undefined, { startReset: true })).toEqual({ kind: "admit", absorbedByStartReset: [{ act: "act-3", did: "press \"Save\" button", call: "call.save", control: "Save" }] });
    expect(ledger.possiblyInPlace()).toEqual([]);
  });
});

// t598: a trial's act was recorded with no item, so on a site with no start hook every undo of it was refused
// `candidate.undo_wrong_target`, and what a passing trial left could only be named under `cannotUndo`.
describe("a trial's act carrying where its step sat and what it made (t598)", () => {
  const trialActs = [
    { step: 2, definitionId: "demo.add", label: "Add oat milk", consequences: ["create_new" as const], spot: { item: "card:oat" }, created: ["line:oat-1"] },
    { step: 3, definitionId: "demo.add", label: "Add jam", consequences: ["create_new" as const] }
  ];

  it("admits an undo on the item its step created or on its own spot, as an explored act's, and refuses one with neither as before", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    expect(ledger.trialRan(trialActs, "trial.1").map((act) => act.act)).toEqual(["act-1", "act-2"]);
    expect(ledger.target("act-1", aim(["delete"], { item: "line:oat-1" }))).toEqual({ kind: "admit", on: "created", allowed: ["delete"] });
    expect(ledger.target("act-1", aim(["modify_existing"], { item: "card:oat" }))).toEqual({ kind: "admit", on: "own", allowed: [] });
    // Another item is not its own: refused unrun, and the act kept at that refusal, as an explored act's is (t475).
    expect(ledger.target("act-1", aim(["delete"], { item: "line:soap" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target", act: "act-1" } });
    expect(ledger.target("act-2", aim(["delete"], { item: "line:jam" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target", act: "act-2" } });
  });

  it("counts a trial's act undone once its undo landed on the item it created and changed its page, and the next trial runs", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.trialRan(trialActs.slice(0, 1), "trial.1");
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1", did: "trial step 2 \"Add oat milk\"" }] } });
    expect(ledger.claim("act-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: [] } });
    expect(ledger.target("act-1", aim(["delete"], { item: "line:oat-1" }))).toMatchObject({ kind: "admit", on: "created" });
    ledger.explored(acted("undo.oat", ["delete"], { undoes: "act-1", on: "created" }, { item: "line:oat-1" }));
    ledger.undoSeen("act-1", true);
    expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
    expect(ledger.inPlace()).toEqual([]);
    // Its one unasked removal is spent.
    expect(ledger.target("act-1", aim(["delete"], { item: "line:oat-1" }))).toMatchObject({ kind: "refused" });
  });

  it("is taken back by a start hook as before, and named among what the hook absorbed", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.trialRan(trialActs, "trial.1");
    expect(await ledger.beforeTrial(back, undefined, { startReset: true })).toEqual({ kind: "admit", absorbedByStartReset: [
      { act: "act-1", did: "trial step 2 \"Add oat milk\"" },
      { act: "act-2", did: "trial step 3 \"Add jam\"" }
    ] });
    expect(ledger.inPlace()).toEqual([]);
  });
});

// F1, office checkout r1 (`run-mved5pro-91998cc2`): a creation admitted against
// an observed destination opened something no list shows and no control
// closes. Fresh complete reads of that destination after it showed it exactly
// as first observed, yet every trial was refused for good. Such an act needs no
// proven undo: the trial runs, the act is listed as left with no change seen,
// and the judge is told. A changed, partial, stale or unbaselined destination
// still refuses, and nothing that predates the build is touched.
describe("a creation whose admitted destination a complete fresh read shows unchanged (F1)", () => {
  const SITE = "r:site";
  const CONTROL = { name: "Open", kind: "button", subject: "s:document", page: "s:document", resource: SITE };
  const read = (lines: string[] = ["s:first", "s:second"], kept = "v:kept"): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope: "p:holder", collections: [
    { scope: "p:lines", group: "g:holder", subjects: lines, states: Object.fromEntries(lines.map((subject) => [subject, `v:${subject}`])) },
    { scope: "p:kept", group: "g:holder", subjects: ["s:kept"], states: { "s:kept": kept } }
  ] });
  const opened = (before = true): AutomationStudioSiteResetLedger => {
    const ledger = new AutomationStudioSiteResetLedger();
    if (before) ledger.observed(read());
    const ref = before ? ledger.destinationReceipts()[0]!.ref : undefined;
    if (before) expect(ledger.createBaseline({ effect: "mutate", consequences: ["create_new"], control: CONTROL }, ref)).toEqual({ kind: "admit" });
    ledger.explored({ callId: "open", toolId: "core.run_node", landed: true, ...(ref ? { resetDestination: ref } : {}), declared: { permitted: true, effect: "mutate", consequences: ["create_new"], control: CONTROL, verb: "press" } });
    return ledger;
  };

  it("runs the trial with the act listed as left with no change seen, tells the judge, and never touches what was there before", async () => {
    const ledger = opened();
    ledger.observed(read());
    const decision = await ledger.beforeTrial(back);
    expect(decision).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", call: "open" }] } });
    const said = automationStudioCandidateStartedWithSaid(decision.kind === "admit" ? decision.startedWith : undefined);
    expect(said).toEqual([`already done by this build (act-1): press "Open" button (${WORDS.leftUnchanged()})`]);
    expect(ledger.inPlace()).toEqual([]);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }] } });
    // Nothing is pressed for it: a claim, on a line that predates the build or any other, is refused unrun.
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept" } });
  });

  // L1: `partial` drops the admitted destination itself; a list of the same page it was never admitted against is no
  // witness (below).
  it.each(["changed", "partial", "stale", "malformed", "unbaselined"] as const)("still refuses the trial when the destination read is %s", async (defect) => {
    const ledger = opened(defect !== "unbaselined");
    if (defect === "changed") ledger.observed(read(["s:first", "s:second", "s:document"]));
    if (defect === "partial") ledger.observed({ ...read(), collections: read().collections!.slice(1) });
    if (defect === "malformed") ledger.observed(read(["s:first", "s:second", "s:second"]));
    if (defect === "unbaselined") ledger.observed(read());
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    expect(await ledger.beforeTrial(back, ["act-1"])).toMatchObject({ kind: "refuse" });
    // Still on the site: to undo, or -- unbaselined, with no ref that could ever be issued -- one no call can settle (t743).
    expect([...ledger.inPlace(), ...ledger.unsatisfiable()].map((act) => act.act)).toEqual(["act-1"]);
    // A line that was there before the build is never an undo's.
    expect(ledger.target("act-1", aim(["delete"], { scope: "p:lines", subject: "s:first", resource: SITE }))).toMatchObject({ kind: "refused" });
  });

  // L1, by design: F1 required the whole group read, so a list on the same page holding nothing the act was about kept it
  // open; it is no witness now, changed or missing.
  it.each(["sibling", "sibling-missing"] as const)("runs the trial when only an unrelated list of the page is %s", async (defect) => {
    const ledger = opened();
    ledger.observed(defect === "sibling" ? read(undefined, "v:kept-changed") : { ...read(), collections: read().collections!.slice(0, 1) });
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", call: "open" }] } });
    expect(ledger.target("act-1", aim(["delete"], { scope: "p:lines", subject: "s:first", resource: SITE }))).toMatchObject({ kind: "refused" });
  });
});

// t748, job round 4 (`run-mvgw1854-5d10955b`): a looped step's acts each read `trial step N "<label>"`, alike when the
// control has no words. A library's renew button, pressed in a loop over three loans.
describe("a looped trial step's acts", () => {
  const renew = (step: number, pass?: { number: number; of: number }) => ({ step, definitionId: "custom.press", label: "renew the loan", consequences: ["modify_existing" as const], ...(pass ? { pass } : {}) });

  it("names each pass in the act's words, with one act and one call per pass", () => {
    const records: Array<{ act: string; ref: string }> = [];
    const ledger = new AutomationStudioSiteResetLedger({ sink: (entry) => records.push({ act: entry.act, ref: entry.ref }) });
    const left = ledger.trialRan([renew(2, { number: 1, of: 3 }), renew(4, { number: 2, of: 3 }), renew(6, { number: 3, of: 3 })], "trial.1");
    expect(left.map(({ act, did }) => ({ act, did }))).toEqual([
      { act: "act-1", did: "trial step 2, pass 1 of 3 \"renew the loan\"" },
      { act: "act-2", did: "trial step 4, pass 2 of 3 \"renew the loan\"" },
      { act: "act-3", did: "trial step 6, pass 3 of 3 \"renew the loan\"" }
    ]);
    expect(new Set(records.map((entry) => entry.ref)).size).toBe(3);
    expect(records.map((entry) => entry.act)).toEqual(["act-1", "act-2", "act-3"]);
    // Each pass is undone on its own: a claim of one leaves the others in place.
    expect(ledger.claim("act-2")).toEqual({ kind: "undo", undo: { act: "act-2", allowed: [] } });
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1", "act-2", "act-3"]);
  });

  it("keeps today's words and call for a step that ran once, and for a pass that is not well formed", () => {
    const records: string[] = [];
    const ledger = new AutomationStudioSiteResetLedger({ sink: (entry) => records.push(entry.ref) });
    const left = ledger.trialRan([{ ...renew(3), control: "Renew" }, renew(5, { number: 1, of: 1 }), renew(7, { number: 4, of: 3 })], "trial.1");
    expect(left.map((act) => act.did)).toEqual(["trial step 3 \"renew the loan\" on \"Renew\"", "trial step 5 \"renew the loan\"", "trial step 7 \"renew the loan\""]);
    expect(records).toEqual(["trial.1#step-3", "trial.1#step-5", "trial.1#step-7"]);
  });
});
