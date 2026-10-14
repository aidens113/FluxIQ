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
  const left = automationStudioProjectSupervisorLeftOnTarget({ projectLedger: ledger, leftAtEnding: ({ note }) => told.push(note) }, { wholeTrialLeftActs: false });
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
