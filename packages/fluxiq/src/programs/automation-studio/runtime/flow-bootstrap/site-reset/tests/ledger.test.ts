import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetExplored, type AutomationStudioSiteResetPlace, type AutomationStudioSiteResetSpot } from "../index.ts";

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

  it("after a start hook, counts acts no longer seen undone with no undo asked, kept ones too, and asks only for what is still seen (t475)", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["modify_existing"]));
    ledger.placed("act-1", { state: { page: "a" }, location: "https://site.test/a", changed: ["new: done 1"] });
    ledger.explored(acted("call.2", ["modify_existing"]));
    ledger.placed("act-2", { state: { page: "b" }, location: "https://site.test/b", changed: ["new: done 2"] });
    ledger.trialRan([{ step: 1, definitionId: "demo.press", consequences: ["create_new"] }], "trial.1");
    // act-2 survived the hook on its own page; act-1 and the trial's act-3 did not.
    const compareAt = async (place: AutomationStudioSiteResetPlace) => ({ moved: true, differs: place.location.endsWith("/b") ? ["new: done 2"] : [] });
    let compared = 0;
    const compare = async () => {
      compared += 1;
      return { moved: true, differs: [] };
    };
    expect(await ledger.beforeTrial({ compare, compareAt }, undefined, { startReset: true })).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-2", stillThere: ["new: done 2"] }] } });
    expect(compared).toBe(1);
    // A start that still differs does not vouch for an act with no page.
    const other = new AutomationStudioSiteResetLedger();
    other.trialRan([{ step: 1, definitionId: "demo.press", consequences: ["create_new"] }], "trial.1");
    expect(await other.beforeTrial(async () => ({ moved: true, differs: ["new: line"] }), undefined, { startReset: true })).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }] } });
    // A kept act the hook put back is no longer said to be in place.
    const kept = new AutomationStudioSiteResetLedger();
    kept.explored(acted("call.1", ["modify_existing"], {}, { item: "row:a" }));
    kept.target("act-1", aim(["delete"], { item: "row:b" }));
    expect(await kept.beforeTrial(back)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }] } });
    kept.trialRan([], "trial.1");
    expect(await kept.beforeTrial(back, undefined, { startReset: true })).toEqual({ kind: "admit" });
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
    if (claim.kind === "refused") expect(String(claim.evidence.instruction)).toContain("checked on its own page before the next trial");
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

  it("runs the trial with an act the reset made no progress on, and keeps it: naming it is refused, and every later trial says so", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["modify_existing"]));
    ledger.placed("act-1", { state: { page: "a" }, location: "https://site.test/a", changed: ["new: \"Done\""] });
    const there = { compare: back, compareAt: async () => ({ moved: true, differs: ["new: \"Done\""] }) };
    expect(await ledger.beforeTrial(there)).toMatchObject({ kind: "refuse" });
    ledger.explored(acted("click.words", [], { undoes: "act-1" }));
    // The same act still there, the same way: no progress, so the trial runs with it.
    const ran = await ledger.beforeTrial(there);
    expect(ran).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1", did: "press \"Save\" button", stillThere: ["new: \"Done\""] }] } });
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept", act: "act-1" } });
    ledger.trialRan([], "trial.1");
    expect(await ledger.beforeTrial(there)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }] } });
  });

  it("keeps an act still there after the reset asked for it twice, though other acts were undone between", async () => {
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
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }] } });
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
  it("lane D's sequence: three confirms no control undoes; the trial runs with them, and every later trial says so", async () => {
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
    // A clean start page and a landed click vouch for nothing; with no progress the trial runs with all three in place.
    expect(await ledger.beforeTrial(requests)).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1" }, { act: "act-2" }, { act: "act-3" }] } });
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

  it("keeps the leftovers of an admitted trial in place, and asks for them again before the next trial", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    const left = { act: "act-1", did: "press \"Save\" button", call: "call.1" };
    ledger.explored(acted("call.1", ["create_new"]));
    expect(await ledger.beforeTrial(unknown)).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" } });
    expect(await ledger.beforeTrial(unknown)).toMatchObject({ kind: "admit", startedWith: { acts: [left] } });
    expect(ledger.trialRan([], "trial.1")).toEqual([left]);
    // Nothing new was recorded, but the act is still in place: the next trial is due all the same, and asked for twice it is now kept.
    expect(await ledger.beforeTrial(unknown)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [left] } });
  });

  it("no longer marks every act undone because the start page is as the build found it (t471)", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored(acted("call.2", ["modify_existing"]));
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }, { act: "act-2" }] } });
  });
});
