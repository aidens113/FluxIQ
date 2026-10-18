import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetExplored, type AutomationStudioSiteResetSpot } from "../index.ts";

// An undo tied to its act by what both are about (t719). An act whose effect
// shows on another page or in another list -- an add from a detail page whose
// line appears in the basket, a line moved to a saved list -- has no item an
// undo there can match by token, so every such undo was refused
// `candidate.undo_wrong_target`, the act was kept, and each later trial ran on
// what the earlier ones left. The domain now says what a control is about (its
// row's title, or for a control in no row its nearest titled part) and what
// its page is about (`subject`, `page`, opaque tokens). An undo is admitted on
// a control whose subject is the act's, by a positive match only, and only for
// a class that reverses the act's. An act with no honest reverse is never
// asked for, whatever its subject.

function acted(callId: string, consequences: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetExplored> = {}, spot: AutomationStudioSiteResetSpot = {}): AutomationStudioSiteResetExplored {
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name: "Add", kind: "button", ...spot }, verb: "press" }, ...extra };
}
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot = {}) => ({ effect: "mutate" as const, consequences, control });
const back = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: [] });

/** An add on a detail page: the control sits in no item, its own part titled by a seller link, the page by the product. */
const DETAIL_ADD: AutomationStudioSiteResetSpot = { subject: "s:seller", page: "s:kettle" };
/** The basket line that add made, on another page: its own item and its title. */
const KETTLE_LINE: AutomationStudioSiteResetSpot = { item: "i:kettle-line", subject: "s:kettle", page: "s:basket" };
/** A line the basket held before the build began. */
const SOAP_LINE: AutomationStudioSiteResetSpot = { item: "i:soap-line", subject: "s:soap", page: "s:basket" };

describe("an undo tied to its act by what both are about (t719)", () => {
  it("admits the removal of a basket line the act added from another page, asked rather than unasked", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.add", ["create_new"], {}, DETAIL_ADD));
    expect(ledger.target("act-1", aim(["delete"], KETTLE_LINE))).toEqual({ kind: "admit", on: "subject", allowed: [] });
    // Lowering its quantity reverses an add too.
    expect(ledger.target("act-1", aim(["modify_existing"], KETTLE_LINE))).toEqual({ kind: "admit", on: "subject", allowed: [] });
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1"]);
  });

  it("an add-to-cart trial act: its undo on the line it made elsewhere is admitted, lands, and the next trial runs", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    expect(ledger.trialRan([{ step: 3, definitionId: "demo.click", label: "add the item to the basket", consequences: ["create_new"], spot: DETAIL_ADD }], "trial.1")).toEqual([{ act: "act-1", did: "trial step 3 \"add the item to the basket\"" }]);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required" } });
    expect(ledger.claim("act-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: [] } });
    expect(ledger.target("act-1", aim(["delete"], KETTLE_LINE))).toEqual({ kind: "admit", on: "subject", allowed: [] });
    ledger.explored(acted("undo.add", ["delete"], { undoes: "act-1", on: "subject" }, KETTLE_LINE));
    ledger.undoSeen("act-1", true);
    expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
    expect(ledger.inPlace()).toEqual([]);
  });

  it("refuses an undo on a line about something else, and keeps the act, as before (t479)", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.add", ["create_new"], {}, DETAIL_ADD));
    expect(ledger.target("act-1", aim(["delete"], SOAP_LINE))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target", act: "act-1" } });
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept" } });
  });

  it("matches only on a token present on both sides: no subject on the control, or none on the act, is no match", () => {
    for (const [act, control] of [[DETAIL_ADD, { item: "i:kettle-line" }], [{}, KETTLE_LINE], [{ subject: "s:seller" }, KETTLE_LINE]] as const) {
      const ledger = new AutomationStudioSiteResetLedger();
      ledger.explored(acted("call.add", ["create_new"], {}, act));
      expect(ledger.target("act-1", aim(["delete"], control))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target" } });
    }
  });

  it("reads the act's page as what it was about only where the act sat in no item: a line's act is about its line", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    // Moving one basket line to the saved list: the line's own item and title, on the basket page.
    ledger.explored(acted("call.save", ["modify_existing"], {}, { item: "i:case-line", subject: "s:case", page: "s:basket" }));
    // A page-level control titled by the basket's heading is not the case's line.
    expect(ledger.target("act-1", aim(["modify_existing"], { subject: "s:basket" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target" } });
  });

  it("admits moving a saved line back, on the saved list's own control, by the line's title", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.save", ["modify_existing"], {}, { item: "i:case-line", subject: "s:case", page: "s:basket" }));
    // The saved list's line is alone, so it has no item token; its nearest titled part names the same thing.
    expect(ledger.target("act-1", aim(["modify_existing"], { subject: "s:case", page: "s:basket" }))).toEqual({ kind: "admit", on: "subject", allowed: [] });
  });

  it("admits only a class that reverses the act's: a removal never undoes a change, and a change made in its place never creates", () => {
    const changed = new AutomationStudioSiteResetLedger();
    changed.explored(acted("call.save", ["modify_existing"], {}, { item: "i:case-line", subject: "s:case" }));
    expect(changed.target("act-1", aim(["delete"], { subject: "s:case" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target" } });
    const added = new AutomationStudioSiteResetLedger();
    added.explored(acted("call.add", ["create_new"], {}, DETAIL_ADD));
    expect(added.target("act-1", aim(["create_new"], KETTLE_LINE))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target" } });
    const removed = new AutomationStudioSiteResetLedger();
    removed.explored(acted("call.remove", ["delete"], {}, { subject: "s:collection" }));
    expect(removed.target("act-1", aim(["create_new"], { subject: "s:collection" }))).toEqual({ kind: "admit", on: "subject", allowed: [] });
    expect(removed.target("act-1", aim(["move_money"], { subject: "s:collection" }))).toMatchObject({ kind: "refused" });
  });

  it("lets the site's one confirmation follow an undo admitted by subject, as it follows one on the act's own item", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.follow", ["modify_existing"], {}, { subject: "s:person", page: "s:person" }));
    expect(ledger.target("act-1", aim(["modify_existing"], { subject: "s:person" }))).toMatchObject({ kind: "admit", on: "subject" });
    ledger.explored(acted("undo.follow", ["modify_existing"], { undoes: "act-1", on: "subject" }, { subject: "s:person" }));
    expect(ledger.target("act-1", aim(["modify_existing"], { dialog: "d:confirm" }))).toEqual({ kind: "admit", on: "follow_up", allowed: [] });
  });
});

describe("an act with no honest reverse (t719)", () => {
  it("a message sent or an order placed is recorded as not undoable: never asked for, never claimable, whatever its subject", async () => {
    for (const consequence of ["send_or_publish", "move_money"] as const) {
      const ledger = new AutomationStudioSiteResetLedger();
      ledger.explored(acted("call.send", [consequence], {}, { subject: "s:thread", page: "s:thread" }));
      expect(ledger.inPlace()).toEqual([]);
      expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
      expect(ledger.target("act-1", aim(["delete"], { subject: "s:thread" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
      expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
    }
    const trial = new AutomationStudioSiteResetLedger();
    expect(trial.trialRan([{ step: 4, definitionId: "demo.click", label: "place the order", consequences: ["move_money"], spot: { subject: "s:order", page: "s:checkout" } }], "trial.1")).toEqual([]);
  });

  it("an act that also sent something stays not undoable, though its other class could be reversed", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.post", ["create_new", "send_or_publish"], {}, { subject: "s:thread" }));
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.target("act-1", aim(["delete"], { subject: "s:thread" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
  });
});
