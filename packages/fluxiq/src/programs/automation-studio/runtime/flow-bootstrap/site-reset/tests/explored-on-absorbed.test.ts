import { describe, expect, it } from "vitest";
import { AutomationStudioSiteResetProjectLedger, automationStudioSiteResetExploredOnAbsorbed, type AutomationStudioSiteResetAbsorbedAct } from "../index.ts";

// t647: what the act log says of an act a start hook took back, and the finding read off it. A library's controls.

const act = (overrides: Partial<AutomationStudioSiteResetAbsorbedAct> = {}): AutomationStudioSiteResetAbsorbedAct => ({ act: "act-4", did: "click \"Make this my home branch\" button", call: "call.4", owner: "brief-2", control: "Make this my home branch", ...overrides });

function without(key: "call" | "owner" | "control"): AutomationStudioSiteResetAbsorbedAct {
  const { [key]: _dropped, ...rest } = act();
  return rest;
}

describe("the explored-on-absorbed finding (t647)", () => {
  it("is read from a project ledger's absorbed acts, which carry their owner and control for Core alone", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    project.forBrief("brief-2").explored({ callId: "call.4", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: { name: "Make this my home branch", kind: "button" }, verb: "click" } });
    const decision = await project.forBrief("brief-2").beforeTrial(async () => ({ moved: false }), undefined, { startReset: true });
    expect(decision).toEqual({ kind: "admit", absorbedByStartReset: [{ act: "act-1", did: "click \"Make this my home branch\" button", call: "call.4", owner: "brief-2", control: "Make this my home branch" }] });
  });

  it("names an explored act no step names, and none a step names in any of its words, its label, or an act the trial landed", () => {
    const found = automationStudioSiteResetExploredOnAbsorbed({ absorbed: [act()], owner: "brief-2", steps: [{ label: "Renew all loans", parameters: { target: { name: "Renew all" } } }], whose: "subflow" });
    expect(found).toEqual([{ code: "trial.explored_on_absorbed_act", act: "act-4", did: act().did, call: "call.4", said: expect.stringContaining("act-4 (click \"Make this my home branch\" button, call call.4) was made while this brief explored") }]);
    for (const steps of [
      [{ parameters: { element: { visibleText: "  make this my HOME branch " } } }],
      [{ parameters: { target: { kind: "element", fingerprint: { label: "Make this my home branch" } } } }],
      [{ label: "Press \"Make this my home branch\"" }]
    ]) expect(automationStudioSiteResetExploredOnAbsorbed({ absorbed: [act()], owner: "brief-2", steps, whose: "subflow" })).toEqual([]);
    expect(automationStudioSiteResetExploredOnAbsorbed({ absorbed: [act()], steps: [], ran: [{ control: "Make this my home branch" }], whose: "flow" })).toEqual([]);
  });

  it("says nothing it did not measure: a trial's act, another brief's, or an act on a control with no name", () => {
    const steps: never[] = [];
    expect(automationStudioSiteResetExploredOnAbsorbed({ absorbed: [without("call")], owner: "brief-2", steps, whose: "subflow" })).toEqual([]);
    expect(automationStudioSiteResetExploredOnAbsorbed({ absorbed: [act()], owner: "brief-3", steps, whose: "subflow" })).toEqual([]);
    expect(automationStudioSiteResetExploredOnAbsorbed({ absorbed: [without("owner")], owner: "brief-2", steps, whose: "subflow" })).toEqual([]);
    expect(automationStudioSiteResetExploredOnAbsorbed({ absorbed: [without("control")], steps, whose: "flow" })).toEqual([]);
    // A word inside another word is not the control named.
    expect(automationStudioSiteResetExploredOnAbsorbed({ absorbed: [act({ control: "Hold" })], steps: [{ label: "Holdings list" }], whose: "flow" })).toHaveLength(1);
  });
});
