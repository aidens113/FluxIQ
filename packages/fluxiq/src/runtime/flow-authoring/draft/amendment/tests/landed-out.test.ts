// A step that did something lasting and is out of the Flow, as the draft says it (t869, `../landed-out.ts`).
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments, automationStudioFlowDraftEntry, automationStudioFlowDraftStepLandedOut, type AutomationStudioFlowDraftStep } from "../../index.ts";

const lasting = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position, id: `d${position}`, iteration: position, actionId: "press", input: { node: "press", consequences: ["modify_existing"] }, effect: "mutate", effectApplied: true, proposes: true, disposition: "kept", ...over
});
const plain = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => lasting(position, { input: { node: "press", consequences: [] }, ...over });

type Line = { step: number; landed?: boolean; inResult: boolean };
const entry = (steps: AutomationStudioFlowDraftStep[]) => automationStudioFlowDraftEntry({ steps, authored: true })!.value as { steps: Line[]; instruction: string };

describe("a step that landed and is out of the Flow", () => {
  it("is one that declared a lasting effect, or names an act, and worked", () => {
    const out = { disposition: "dropped" as const };
    expect(automationStudioFlowDraftStepLandedOut(lasting(1, out))).toBe(true);
    expect(automationStudioFlowDraftStepLandedOut(lasting(1, { disposition: "exploratory" }))).toBe(true);
    expect(automationStudioFlowDraftStepLandedOut(lasting(1, { disposition: "taken" }))).toBe(true);
    expect(automationStudioFlowDraftStepLandedOut(plain(1, { ...out, acts: ["a1"] }))).toBe(true);
    const performedBefore = { ...lasting(1), lasting: true as const };
    expect(automationStudioFlowDraftStepLandedOut(lasting(1, { ...out, priorExecution: performedBefore, effectApplied: false }))).toBe(true);
  });

  it("is not a step still in the Flow, one that changed nothing lasting, one that failed, one never run, or half of a pair that undid itself", () => {
    const out = { disposition: "dropped" as const };
    expect(automationStudioFlowDraftStepLandedOut(lasting(1))).toBe(false);
    expect(automationStudioFlowDraftStepLandedOut(plain(1, out))).toBe(false);
    expect(automationStudioFlowDraftStepLandedOut(lasting(1, { ...out, effectApplied: false }))).toBe(false);
    expect(automationStudioFlowDraftStepLandedOut(lasting(1, { ...out, effectApplied: false, written: true }))).toBe(false);
    expect(automationStudioFlowDraftStepLandedOut(lasting(1, { ...out, proposes: false }))).toBe(false);
    expect(automationStudioFlowDraftStepLandedOut(lasting(1, { ...out, cancels: "d2" }))).toBe(false);
  });
});

describe("the draft entry", () => {
  it("marks it, says what it means once, in words of no site, and says nothing of a draft with none", () => {
    const steps = [plain(1), lasting(2), plain(3, { disposition: "dropped" }), lasting(4, { disposition: "dropped", acts: ["a1"] })];
    const value = entry(steps);
    expect(value.steps.filter((line) => line.landed).map((line) => line.step)).toEqual([4]);
    expect(value.instruction.match(/A step showing landed/gu)).toHaveLength(1);
    expect(value.instruction).toContain("Leaving it out undoes nothing");
    expect(value.instruction).toContain("put the step back with amend_draft add or keep, naming its act: that runs nothing");

    const none = entry([plain(1), lasting(2)]);
    expect(none.steps.some((line) => Object.hasOwn(line, "landed"))).toBe(false);
    expect(none.instruction).not.toContain("landed");
  });

  it("goes with the step: a drop applied marks it, and keep puts it back unmarked", () => {
    const steps = [plain(1), lasting(2)];
    const dropped = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "drop" }]);
    expect(dropped).toMatchObject({ applied: 1, refused: [] });
    expect(entry(steps).steps[1]).toMatchObject({ landed: true, inResult: false });
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "keep" }])).toMatchObject({ applied: 1, refused: [] });
    expect(entry(steps).steps[1]).toMatchObject({ inResult: true });
    expect(entry(steps).steps[1]).not.toHaveProperty("landed");
  });

  it("a drop again is the draft's own already-out, and changes nothing", () => {
    const steps = [plain(1), lasting(2, { disposition: "dropped" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "drop" }])).toMatchObject({ applied: 0, refused: [{ step: 2, reason: "already_out" }] });
  });
});
