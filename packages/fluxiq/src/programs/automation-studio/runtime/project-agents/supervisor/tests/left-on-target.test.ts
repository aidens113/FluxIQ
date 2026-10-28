import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetExplored } from "../../../flow-bootstrap/site-reset/index.ts";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import { automationStudioProjectSupervisorLeftOnTarget } from "../left-on-target.ts";

// What an ending names still on the target (t597): a press that declared no
// lasting act but changed its page is named as possibly still there, never as
// there, and never once a start hook took it back. A8 crossborder ended
// "Nothing this build did is still on the target" with its coupon press, which
// no hook took back, still applied.

function pressed(callId: string, name: string, consequences: AutomationStudioActionConsequence[]): AutomationStudioSiteResetExplored {
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name, kind: "button" }, verb: "press" } };
}
const back = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: [] });

function leftOn(ledger: AutomationStudioSiteResetProjectLedger) {
  const told: Array<string | undefined> = [];
  const left = automationStudioProjectSupervisorLeftOnTarget({ projectLedger: ledger, leftAtEnding: ({ note }) => told.push(note) });
  return { left, told };
}

describe("an ending with possibly lasting presses on the target", () => {
  it("names them as possibly still there, apart from the acts in place, and asks no reset for them", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    ledger.forBrief("brief-1").explored(pressed("coupon", "Apply coupon", []));
    const { left, told } = leftOn(ledger);

    expect(left.acts).toEqual([]);
    expect(left.possibly).toEqual([{ act: "act-1", did: "press \"Apply coupon\" button (declared no lasting act, but had an effect: possibly lasting)", brief: "brief-1" }]);
    expect(left.undoable).toBe(false);
    expect(left.note).toBe("Possibly still on the target, though nothing checked: press \"Apply coupon\" button (declared no lasting act, but had an effect: possibly lasting).");
    expect(left.note).not.toContain("Still on the target from this build");
    // The ending's reason carries it after the model's words, and the build is told it in Core's words.
    expect(left.reason("The total could not be read.")).toBe(`The total could not be read. ${left.note}`);
    expect(told).toEqual([left.note]);
  });

  it("names an act in place as there, and a possibly lasting press after it as possibly there", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    ledger.forBrief("brief-1").explored(pressed("save", "Save", ["create_new"]));
    ledger.forBrief("brief-2").explored(pressed("coupon", "Apply coupon", []));
    const { left } = leftOn(ledger);

    expect(left.acts).toEqual([{ act: "act-1", did: "press \"Save\" button", brief: "brief-1", undoable: true }]);
    expect(left.possibly.map((act) => [act.act, act.brief])).toEqual([["act-2", "brief-2"]]);
    expect(left.undoable).toBe(true);
    expect(left.note).toBe("Still on the target from this build: press \"Save\" button. Possibly still on the target, though nothing checked: press \"Apply coupon\" button (declared no lasting act, but had an effect: possibly lasting).");
  });

  it("does not name a possibly lasting press a start hook took back, and says nothing when nothing is left", async () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const brief = ledger.forBrief("brief-1");
    brief.explored(pressed("coupon", "Apply coupon", []));
    await brief.beforeTrial(back, undefined, { startReset: true });
    const { left, told } = leftOn(ledger);

    expect(left.possibly).toEqual([]);
    expect(left.note).toBeUndefined();
    expect(left.reason("Done.")).toBe("Done.");
    expect(told).toEqual([undefined]);
  });

  // t738, job-board `run-mvgf4pk5-55343613`: three presses on nameless controls, none of which any read showed changing
  // anything, ended "still on the site: one more change". They are counted, and told as ones that may have changed nothing.
  it("counts acts in place no name says, and tells acts no change of was seen as ones that may have changed nothing, to check", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const brief = ledger.forBrief("brief-1");
    for (const call of ["save-1", "save-2", "save-3"]) {
      brief.explored({ callId: call, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: { name: null, kind: "span", subject: `s:${call}` }, verb: "click" } });
    }
    const { left } = leftOn(ledger);

    expect(left.acts.map((act) => act.act)).toEqual(["act-1", "act-2", "act-3"]);
    expect(left.told).toContain("pressed 3 controls with no label");
    expect(left.told).toContain("nothing read afterwards could show whether they changed anything; check them");
    expect(left.told).not.toContain("These changes the build made are still on the site");
  });

  it("names the latest ten by name and counts the rest, as a phase start does", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const brief = ledger.forBrief("brief-1");
    for (let press = 1; press <= 12; press += 1) brief.explored(pressed(`filter.${press}`, `Filter ${press}`, []));
    const { left } = leftOn(ledger);

    expect(left.possibly).toHaveLength(12);
    expect(left.note).not.toContain("\"Filter 2\"");
    expect(left.note).toContain("\"Filter 3\"");
    expect(left.note).toContain("\"Filter 12\"");
    expect(left.note!.endsWith("; and 2 earlier such presses.")).toBe(true);
  });
});

// A job-board build's failed chat (t567 lane 4) showed this note as it was: every press, one link
// four times, an overlay's close control as `click "–" div`, with the ledger's terms after each.
describe("an ending the person reads", () => {
  function clicked(callId: string, name: string, kind: string, verb = "click"): AutomationStudioSiteResetExplored {
    return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: [], control: { name, kind }, verb } };
  }

  it("says what is left in plain words, each press once, and keeps the ledger's words for the record", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const brief = ledger.forBrief("brief-1");
    brief.explored(clicked("c1", "Reject non-essential", "button"));
    brief.explored(clicked("c2", "What", "input", "type text"));
    brief.explored(clicked("c3", "No thanks", "link"));
    brief.explored(clicked("c4", "–", "div"));
    for (let press = 5; press <= 8; press += 1) brief.explored(clicked(`c${press}`, "Platform Engineer", "link"));
    for (const press of [9, 10]) brief.explored(clicked(`c${press}`, "Add to shortlist", "button"));
    const told: Array<string | undefined> = [];
    const left = automationStudioProjectSupervisorLeftOnTarget({ projectLedger: ledger, leftAtEnding: (said) => told.push(said.told) });

    expect(left.note).toContain("click \"Platform Engineer\" link (declared no lasting act, but had an effect: possibly lasting)");
    // A dismissal and a link save nothing by themselves, and are not listed (t753, `activity/wording/act-words.ts`).
    expect(left.told).toBe("The build clicked “Add to shortlist”, which changed the page and might have left something behind, so check it if you need the site exactly as it was.");
    left.reason("Done.");
    expect(told).toEqual([left.told]);
  });
});

// t741 B5, photo-social `run-mvgobp8h-b99ede98`: an act whose undo was refused as aimed at another item was ended as
// "(the site offers no way to undo it)", though later reads showed the control back. Office `run-mvgo5xft-25460ba2`:
// the model's words gave way at the character that fitted, and the chat said "... The part that takes t."
describe("an ending that says only what is known", () => {
  function onItem(callId: string, name: string, consequences: AutomationStudioActionConsequence[], item: string): AutomationStudioSiteResetExplored {
    return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name, kind: "button", item }, verb: "press" } };
  }

  it("says a kept reversible act could not be undone and may still be there, and a class no control takes back as FluxIQ cannot undo", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const one = ledger.forBrief("brief-1");
    one.explored(onItem("mark", "Mark", ["create_new"], "card:soup"));
    expect(one.target("act-1", { effect: "mutate", consequences: ["modify_existing"], control: { item: "card:bread" } })).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target" } });
    ledger.forBrief("brief-2").explored(pressed("pay", "Pay", ["move_money"]));
    const { left } = leftOn(ledger);

    expect(left.note).toBe("Still on the target from this build: press \"Mark\" button (the build could not undo it; it may still be there); press \"Pay\" button (cannot be undone by FluxIQ).");
    expect(left.told).toBe("These changes the build made are still on the site: clicked “Pay” (FluxIQ cannot undo this). The build clicked “Mark”, but could not undo it, so it may still be on the site; check it if you need the site exactly as it was.");
    expect(`${left.note} ${left.told}`).not.toContain("site offers no way");
  });

  it("lets the model's words give way at a sentence's end, else a word's end, never mid-word", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    for (let press = 1; press <= 25; press += 1) ledger.forBrief("brief-1").explored(pressed(`save.${press}`, `Save the entry numbered ${press} in the catalogue`, ["create_new"]));
    const { left } = leftOn(ledger);
    const room = 2000 - left.note!.length - 1;
    const said = `I could not finish this. The part that takes the loan request to the desk was built, ${"and the part that reads it back could not be made to work ".repeat(30)}so there is nothing to give you.`;
    expect(room).toBeGreaterThan(30);
    expect(room).toBeLessThan(said.length);
    const reason = left.reason(said);
    expect(reason.length).toBeLessThanOrEqual(2000);
    expect(reason).toBe(`I could not finish this. ${left.note}`);
    // No sentence end fits: cut at a word's end, with "…".
    const long = `I ${"could not reach the desk ".repeat(200)}today.`;
    const one = left.reason(long);
    expect(one.endsWith(` ${left.note}`)).toBe(true);
    const cut = one.slice(0, -left.note!.length - 1);
    expect(cut.endsWith("…")).toBe(true);
    // What is kept ends where a word of the model's ends.
    expect(long.startsWith(`${cut.slice(0, -1)} `)).toBe(true);
  });
});

// t743 (S2): an act no call can settle -- a press on a control in no list any read showed, so nothing can be named for
// it -- is never among the acts in place, since no reset is asked to undo it, yet it is still on the target.
describe("an ending with an act no call can settle on the target", () => {
  it("names it as still there, never undoable", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    ledger.forBrief("brief.earlier").explored({ ...pressed("mark", "Mark", ["modify_existing"]), declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: { name: "Mark", kind: "button", subject: "s:mark" }, verb: "press" } });
    expect(ledger.unsatisfiable().map((act) => act.act)).toEqual(["act-1"]);
    const { left } = leftOn(ledger);
    expect(left.acts).toEqual([{ act: "act-1", did: "press \"Mark\" button", brief: "brief.earlier", undoable: false, unsettleable: true }]);
    expect(left).toMatchObject({ undoable: false, unsettleable: true, note: "Still on the target from this build: press \"Mark\" button (it can no longer be checked or put back; it may still be there)." });
    // No read ever showed it change anything: the person is told it may have changed nothing, to check (t738).
    expect(left.told).toContain("The build clicked “Mark”, and nothing read afterwards could show whether it changed anything; check it");
  });
});

// t785: a build that ends with a Flow says which of its own acts remain, in generic words, and nothing when none do.
describe("announcing what a finished build left", () => {
  function announced(ledger: AutomationStudioSiteResetProjectLedger): ClientGatewayActivity[] {
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    try {
      runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, () => leftOn(ledger).left.announce());
    } finally {
      unsubscribe();
    }
    return seen;
  }

  it("says nothing when nothing is left", () => {
    expect(announced(new AutomationStudioSiteResetProjectLedger())).toEqual([]);
  });

  it("says a press that changed its page and might have left something behind, in the ledger's person words", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    ledger.forBrief("brief-1").explored(pressed("coupon", "Apply coupon", []));
    const rows = announced(ledger);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("Left on the site");
    expect(JSON.stringify(rows[0]!.detail)).toContain("Apply coupon");
    expect(JSON.stringify(rows[0]!.detail)).not.toContain("The build left no change");
  });
});
