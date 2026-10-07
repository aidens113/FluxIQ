// An amendment's settings never rewrite what a step ran with (`../settings-rewrite-run.ts`).
// Live run `run-mux74k5q-1c3c2127` (C1, decision 0025) sent
// `{"step":12,"change":"add","act":"a1.quantity","settings":{"target":{"handle":"t964"}}}`
// about a press of the Spain chip (t958); it applied, and the Flow would have
// pressed the quantity field.
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";

/** A press of the Spain chip as a run-node call writes it: shown by handle, run by selector. */
function draft(): AutomationStudioFlowDraftStep[] {
  const press = (position: number, handle: string, disposition: AutomationStudioFlowDraftStep["disposition"]): AutomationStudioFlowDraftStep => ({
    position, id: `d${position}`, iteration: position, actionId: "web.dom.click", toolId: "core.run_node",
    input: { node: "web.dom.click", parameters: { target: { handle } }, consequences: [] },
    ranWith: { node: "web.dom.click", parameters: { selector: `#c${position}`, element: { tagName: "button", accessibleName: `control ${position}` } }, consequences: [] },
    effect: "mutate", effectApplied: true, disposition
  });
  return [press(1, "t900", "kept"), { ...press(2, "t958", "taken"), acts: ["a1.origin"] }, { ...press(3, "t964", "kept"), acts: ["a1.quantity"] }];
}

describe("settings that rewrite what a step ran with", () => {
  it("run mux74k5q 0025: add with act and another target is refused and changes nothing", () => {
    const steps = draft();
    const before = structuredClone(steps);
    const report = applyAutomationStudioFlowDraftAmendments(steps, [
      { step: 2, change: "add", act: "a1.quantity", settings: { target: { handle: "t964" } } }
    ]);
    expect(report).toEqual({ applied: 0, refused: [{ step: 2, reason: "settings_rewrite_run" }] });
    expect(steps).toEqual(before);
    expect(steps[1]!.settings).toBeUndefined();
    expect(steps[1]!.acts).toEqual(["a1.origin"]);
    expect(steps[1]!.disposition).toBe("taken");
    expect(steps[2]!.acts).toEqual(["a1.quantity"]);
  });

  it("refuses a parameter of what the step ran with (selector, element) given another value", () => {
    for (const settings of [{ selector: "#elsewhere" }, { element: { tagName: "input" } }]) {
      const steps = draft();
      const before = structuredClone(steps);
      expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "keep", settings }]))
        .toEqual({ applied: 0, refused: [{ step: 1, reason: "settings_rewrite_run" }] });
      expect(steps).toEqual(before);
    }
  });

  it("refuses a flat argument's parameter given another value, on routing, reorder and bind as well", () => {
    const flat = (): AutomationStudioFlowDraftStep[] => [1, 2, 3].map((position) => ({
      position, iteration: position, actionId: "type", input: { text: `value ${position}`, submit: false }, effect: "mutate" as const, effectApplied: true, disposition: "kept" as const
    }));
    for (const amendment of [
      { step: 2, change: "keep" as const, settings: { text: "other" } },
      { step: 2, change: "optional" as const, settings: { submit: true } },
      { step: 2, change: "reorder" as const, to: 3, settings: { text: "other" } },
      { step: 2, change: "bind" as const, input: { text: { $input: "words", test: "value 2" } }, settings: { text: "other" } }
    ]) {
      const steps = flat();
      const before = structuredClone(steps);
      expect(applyAutomationStudioFlowDraftAmendments(steps, [amendment])).toEqual({ applied: 0, refused: [{ step: 2, reason: "settings_rewrite_run" }] });
      expect(steps).toEqual(before);
    }
  });

  it("still applies settings the step did not run with, and a parameter given the value it ran with", () => {
    const steps = draft();
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "add", act: "a1", settings: { expectedState: "cart shows the hub", timeoutMs: 5000 } }]))
      .toEqual({ applied: 1, refused: [] });
    expect(steps[1]).toMatchObject({ disposition: "kept", acts: ["a1.origin", "a1"], settings: { expectedState: "cart shows the hub", timeoutMs: 5000 } });
    // The value it was shown with, or the value it ran with, says nothing new about the step.
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "keep", settings: { target: { handle: "t900" }, selector: "#c1" } }]))
      .toEqual({ applied: 1, refused: [] });
    expect(steps[0]!.settings).toEqual({ target: { handle: "t900" }, selector: "#c1" });
  });
});
