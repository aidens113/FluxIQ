import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetExplored } from "../index.ts";

// The ledger as the permission wrapper and the trial gate drive it: what
// becomes an act, which claims it accepts, and how a trial restarts a phase.

function acted(callId: string, consequences: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored {
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name: "Save", kind: "button" }, verb: "press" }, ...extra };
}
const back = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: [] });
const unknown = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false });

describe("site reset ledger", () => {
  it("records a landed, permitted, lasting call as an act named by verb, control words and kind, with the call id the model gave it", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    expect(ledger.inPlace()).toEqual([{ act: "act-1", did: "press \"Save\" button", call: "call.1" }]);
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

  it("allows deleting only when undoing an act that created something", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored(acted("call.2", ["modify_existing"]));
    expect(ledger.claim("act-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: ["delete"] } });
    expect(ledger.claim("act-2")).toEqual({ kind: "undo", undo: { act: "act-2", allowed: [] } });
    expect(ledger.claim(undefined)).toEqual({ kind: "none" });
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

  it("marks an act undone by a landed undo, which never becomes an act of its own, and accepts it again only until the next trial", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored(acted("call.undo.failed", ["delete"], { undoes: "act-1", landed: false }));
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1"]);
    ledger.explored(acted("call.undo", ["delete"], { undoes: "act-1" }));
    expect(ledger.inPlace()).toEqual([]);
    // A second try is accepted, but removes nothing more without asking.
    expect(ledger.claim("act-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: [] } });
    await ledger.beforeTrial(unknown);
    ledger.trialRan([], "trial.1");
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused" });
  });

  it("numbers acts once and never reuses a number, the trial's own acts included", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored(acted("call.2", ["create_new"]));
    ledger.explored(acted("undo.2", ["delete"], { undoes: "act-2" }));
    expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
    const left = ledger.trialRan([{ step: 3, definitionId: "demo.press", label: "Keep it", control: "Save", consequences: ["create_new"] }, { step: 4, definitionId: "demo.pay", consequences: ["move_money"] }], "trial.1");
    expect(left).toEqual([{ act: "act-3", did: "trial step 3 \"Keep it\" on \"Save\"" }]);
    ledger.explored(acted("call.3", ["modify_existing"]));
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-3", "act-5"]);
    expect(ledger.claim("act-3")).toEqual({ kind: "undo", undo: { act: "act-3", allowed: ["delete"] } });
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
    expect(await ledger.beforeTrial(unknown)).toEqual({ kind: "admit", startedWith: { acts: [left] } });
    expect(ledger.trialRan([], "trial.1")).toEqual([left]);
    // Nothing new was recorded, but an act is still in place: the next trial is due all the same.
    expect(await ledger.beforeTrial(unknown)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [left] } });
    expect(await ledger.beforeTrial(unknown)).toEqual({ kind: "admit", startedWith: { acts: [left] } });
    ledger.trialRan([], "trial.2");
    ledger.explored(acted("call.2", ["modify_existing"]));
    expect(await ledger.beforeTrial(unknown)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-1" }, { act: "act-2" }] } });
  });

  it("marks every act undone when the start check finds the site back", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.1", ["create_new"]));
    ledger.explored(acted("call.2", ["modify_existing"]));
    expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.trialRan([], "trial.1")).toEqual([]);
  });
});
