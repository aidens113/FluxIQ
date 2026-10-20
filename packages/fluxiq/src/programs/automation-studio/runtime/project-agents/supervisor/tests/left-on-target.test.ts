import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetExplored } from "../../../flow-bootstrap/site-reset/index.ts";
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
    expect(left.told).toContain("3 presses it could not name");
    expect(left.told).toContain("may have changed nothing; check them");
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
    const told: Array<string | undefined> = [];
    const left = automationStudioProjectSupervisorLeftOnTarget({ projectLedger: ledger, leftAtEnding: (said) => told.push(said.told) });

    expect(left.note).toContain("click \"Platform Engineer\" link (declared no lasting act, but had an effect: possibly lasting)");
    expect(left.told).toBe("The build left no change on the site that it knows of. It also clicked “Reject non-essential”, “No thanks” and “Platform Engineer”, which changed the page and might have left something behind, so check them if you need the site exactly as it was.");
    left.reason("Done.");
    expect(told).toEqual([left.told]);
  });
});
