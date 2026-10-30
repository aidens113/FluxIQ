import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot,
  type AutomationStudioSiteResetTrialAct
} from "../../site-reset/index.ts";

// t772 value witness, wired (rerun round 6 `run-mvrj7qg8-6916b3f7` cause 1, in a neutral shape): a lasting
// `modify_existing` press that confirms a choice and reloads its page to the same address shows its effect on neither a
// list nor its own control, only on a value the page shows. It settles from a fresh read of that value back at the
// build's start, or closes honestly. Made-up fixture: an app's preferences page, whose Save reloads it, and an inline
// chooser of themes. Opaque tokens only.

const APP = "r:app", PREFS = "p:prefs", AT = "loc:prefs";
/** The act's own control: the preferences form's Save. */
const SAVE: AutomationStudioSiteResetSpot = { resource: APP, scope: PREFS, place: "pl:form-buttons", state: "st:save" };
/** An option of the inline chooser: its radios sit in a list of their own. */
const LIGHT: AutomationStudioSiteResetSpot = { resource: APP, scope: "p:theme-options", item: "i:light", place: "pl:theme-radios", state: "st:light-off" };
/** The page's shown values: the theme in use, and each option's label beside it. */
const shown = (theme: string): Record<string, string> => ({ "pl:theme": theme, "pl:light-label": "v:light", "pl:dark-label": "v:dark" });
const prefs = (values?: Record<string, string>): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: APP, scope: PREFS, location: AT, controls: { "pl:form-buttons": { "st:save": 1 } }, ...(values ? { values } : {}) });
/** What the explored Save replaced: the theme it used, gone from the page; the new one an option's label already showed. */
const WITNESS = { page: PREFS, location: AT, replaced: [{ place: "pl:theme", from: "v:light", to: "v:dark" }] };
const press = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: "Press", kind: "button", ...spot }, verb: "press" }, ...extra });
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot) => ({ effect: "mutate" as const, consequences, control });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
const settleOf = (ledger: AutomationStudioSiteResetLedger, act: string): string => ledger.inPlace().find((entry) => entry.act === act)?.settle ?? "";

/** An explored Save, read around in place: the theme read before it, the page read again after it reloaded to its address. */
const saved = (): AutomationStudioSiteResetLedger => {
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.observed(prefs(shown("v:light")));
  ledger.explored(press("save-dark", ["modify_existing"], SAVE));
  ledger.observed(prefs(shown("v:dark")));
  ledger.placed("act-1", { state: {}, location: AT, changed: ["theme"], values: WITNESS });
  return ledger;
};

describe("a lasting press whose effect shows only as a value its page shows (t772)", () => {
  it("is witnessed by that value: the trial runs with it listed, and it says to set it back where it shows, never the list route", async () => {
    const ledger = saved();
    const decision = await ledger.beforeTrial(compare);
    expect(decision).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1" }] } });
    expect(ledger.unsatisfiable()).toEqual([]);
    const settle = settleOf(ledger, "act-1");
    expect(settle).toContain("set it back where it shows");
    expect(settle).toContain("modify_existing");
    expect(settle).not.toContain("resetDestination");
  });

  it("admits a choice declaring nothing on the act's page as a step toward the undo, which makes earlier reads stale and counts no attempt", () => {
    const ledger = saved();
    expect(ledger.target("act-1", aim([], LIGHT))).toEqual({ kind: "admit", on: "step", allowed: [] });
    ledger.explored(press("pick-light", [], LIGHT, { undoes: "act-1", on: "step" }));
    expect(settleOf(ledger, "act-1")).toContain("ead the page at loc:prefs again so the value this act set can be seen");
    ledger.observed(prefs(shown("v:dark")));
    // Two steps, each read fresh and still showing the value it set: no attempt was counted, so nothing closes it.
    ledger.explored(press("pick-light-again", [], LIGHT, { undoes: "act-1", on: "step" }));
    ledger.observed(prefs(shown("v:dark")));
    expect(ledger.unsatisfiable()).toEqual([]);
    expect(ledger.inPlace().map((entry) => entry.act)).toEqual(["act-1"]);
  });

  it("admits its own control declaring modify_existing as its own undo, and settles restored once a fresh read shows the start value", async () => {
    const ledger = saved();
    expect(ledger.target("act-1", aim(["modify_existing"], SAVE))).toEqual({ kind: "admit", on: "own", allowed: ["modify_existing"] });
    ledger.explored(press("save-light", ["modify_existing"], SAVE, { undoes: "act-1", on: "own" }));
    // Not yet read: stale, never restored on the read from before the undo.
    expect(ledger.standing("act-1")).toBe("in_place");
    ledger.observed(prefs(shown("v:light")));
    expect(ledger.standing("act-1")).toBe("restored");
    expect(await ledger.beforeTrial(compare)).toEqual({ kind: "admit" });
  });

  it("refuses another control declaring a lasting class, naming the own control, met on this page", () => {
    const answer = saved().target("act-1", aim(["modify_existing"], LIGHT));
    expect(answer).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unproved", failed: "value_not_own_control", canMeet: "this_page" } });
  });

  it("refuses its own control declaring nothing lasting: not the inverse, met on this page", () => {
    const answer = saved().target("act-1", aim([], SAVE));
    expect(answer).toMatchObject({ kind: "refused", evidence: { failed: "consequence_not_inverse", canMeet: "this_page" } });
  });

  it("closes the act once two own undos landed and fresh reads after each still do not show the start value", () => {
    const ledger = saved();
    ledger.explored(press("save-light", ["modify_existing"], SAVE, { undoes: "act-1", on: "own" }));
    ledger.observed(prefs(shown("v:dark")));
    expect(ledger.unsatisfiable()).toEqual([]);
    ledger.explored(press("save-light-again", ["modify_existing"], SAVE, { undoes: "act-1", on: "own" }));
    ledger.observed(prefs(shown("v:dark")));
    expect(ledger.unsatisfiable()).toEqual([expect.objectContaining({ act: "act-1", reason: "gate_unsatisfiable", failed: "value_not_back" })]);
    expect(ledger.inPlace()).toEqual([]);
    // Closed: no further press is met on this page.
    expect(ledger.target("act-1", aim(["modify_existing"], SAVE))).toMatchObject({ kind: "refused", evidence: { canMeet: "no_call" } });
  });

  it("lists an act whose value's place was never read before it apart, as no_baseline, and no refusal for it is met on this page", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(prefs({ "pl:light-label": "v:light", "pl:dark-label": "v:dark" }));
    ledger.explored(press("save-dark", ["modify_existing"], SAVE));
    ledger.placed("act-1", { state: {}, location: AT, changed: ["theme"], values: WITNESS });
    ledger.observed(prefs(shown("v:dark")));
    expect(ledger.unsatisfiable()).toEqual([expect.objectContaining({ act: "act-1", reason: "gate_unsatisfiable", failed: "no_baseline" })]);
    for (const [consequences, control] of [[["modify_existing"], LIGHT], [[], SAVE], [["modify_existing"], SAVE], [[], LIGHT]] as const) {
      const answer = ledger.target("act-1", aim([...consequences], control));
      if (answer.kind === "refused") expect(answer.evidence.canMeet).toBe("no_call");
      else expect(answer.on).not.toBe("own");
    }
  });

  it("witnesses a trial step's act by the values its own diff replaced; a later read at the start settles it", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    const act: AutomationStudioSiteResetTrialAct = { step: 3, definitionId: "demo.save", label: "save the preferences", control: "Save", consequences: ["modify_existing"], spot: SAVE, values: { page: PREFS, location: AT, replaced: [{ place: "pl:theme", from: "v:light", to: "v:dark", newValue: true }] } };
    ledger.trialRan([act], "trial-1");
    expect(settleOf(ledger, "act-1")).toContain("ead the page at loc:prefs again so the value this act set can be seen");
    ledger.observed(prefs(shown("v:dark")));
    expect(settleOf(ledger, "act-1")).toContain("set it back where it shows");
    ledger.observed(prefs(shown("v:light")));
    expect(ledger.standing("act-1")).toBe("restored");
  });
});

// t772 w7: what the ledger reports as left of a value act is what its settlement answered (`../../reset-ledger/leftover.ts`).
describe("what the ledger reports as left of a value act (t772 w7)", () => {
  it("never reports a value act whose start value a fresh read shows back as left", () => {
    const ledger = saved();
    expect(ledger.leftover("act-1")).toEqual({ left: "yes", standing: "in_place" });
    ledger.explored(press("save-light", ["modify_existing"], SAVE, { undoes: "act-1", on: "own" }));
    ledger.observed(prefs(shown("v:light")));
    expect(ledger.leftover("act-1")).toEqual({ left: "no", standing: "restored" });
    expect(ledger.trialRan([], "trial-1")).toEqual([]);
  });

  it("reports a value act closed after its capped undos as possibly left, carrying value_not_back", () => {
    const ledger = saved();
    for (const call of ["save-light", "save-light-again"]) {
      ledger.explored(press(call, ["modify_existing"], SAVE, { undoes: "act-1", on: "own" }));
      ledger.observed(prefs(shown("v:dark")));
    }
    expect(ledger.leftover("act-1")).toEqual({ left: "possibly", standing: "unsettleable", failed: "value_not_back" });
    expect(ledger.standing("act-1")).toBe("unsettleable");
    expect(ledger.unsatisfiable().map((act) => act.failed)).toEqual(["value_not_back"]);
    expect(ledger.inPlace()).toEqual([]);
  });
});

describe("a witnessless change is never answered by the subject deletion's conditions (t772)", () => {
  const NOTE: AutomationStudioSiteResetSpot = { resource: APP, scope: "p:notebooks", subject: "s:notebook-a", page: "s:notebooks" };

  it("refuses an undo of a modify_existing act with no value witness and no named list as no exact inverse, met by no call", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed({ state: {}, differs: [], resource: APP, scope: "p:notebooks-page", location: "loc:notebooks" });
    ledger.explored(press("rename", ["modify_existing"], NOTE));
    for (const control of [{ ...NOTE, item: "i:notebook-a" }, { resource: APP, scope: "p:notebooks", item: "i:other" }]) {
      expect(ledger.target("act-1", aim(["modify_existing"], control))).toMatchObject({ kind: "refused", evidence: { failed: "no_exact_inverse", canMeet: "no_call" } });
    }
  });
});

describe("an act with another witness ignores a value witness (t772)", () => {
  it("settles a toggle pressed back though a notice that changed with it still shows", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    const page = (state: string, notice: string): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: APP, scope: PREFS, location: AT, controls: { "pl:mute": { [state]: 1 } }, values: { "pl:notice": notice } });
    ledger.observed(page("st:off", "v:no-notice"));
    ledger.explored(press("mute", ["modify_existing"], { resource: APP, scope: PREFS, place: "pl:mute", state: "st:off" }));
    ledger.observed(page("st:on", "v:saved-notice"));
    ledger.placed("act-1", { state: {}, location: AT, changed: ["muted"], values: { page: PREFS, location: AT, replaced: [{ place: "pl:notice", from: "v:no-notice", to: "v:saved-notice", newValue: true }] } });
    ledger.explored(press("unmute", ["modify_existing"], { resource: APP, scope: PREFS, place: "pl:mute", state: "st:on" }, { undoes: "act-1", on: "own" }));
    ledger.observed(page("st:off", "v:saved-notice"));
    expect(ledger.standing("act-1")).toBe("restored");
  });
});
