// The one amendment that answers `act_needs_repeat` (lane t195, run
// `run-muntu7in-e3dd1972`: eight refusals, and the amendment never written).
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { automationStudioRepeatSuggestion } from "../index.ts";

const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

function step(position: number, actionId: string, disposition: AutomationStudioFlowDraftStep["disposition"] = "kept"): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, callId: `call.${position}`, actionId, input: {}, effect: "mutate", effectApplied: true, disposition };
}

const needsRepeat = (claimed: string) => ({ acts: [{ id: "a1", kind: "confirm", verb: "confirm", quote: "confirm everyone", plural: true, reason: "act_needs_repeat", step: claimed }] });

describe("the amendment an act that needs a repeat is told", () => {
  it("repeats the claimed step over the listing right before it", () => {
    const draftSteps = [step(1, "web.output.browser-navigate"), step(2, "web.output.dom-extract_list"), step(3, "web.output.dom-click")];
    const suggestion = automationStudioRepeatSuggestion({ missingActs: needsRepeat("d3"), draftSteps, registry, resolution });

    expect(suggestion?.amendment).toEqual({ step: 3, change: "repeat", over: 2, through: 3 });
    expect(suggestion?.instruction).toContain("send it as amend_draft");
    expect(suggestion?.instruction).toContain("where that keeps only the ones to act on");
    expect(suggestion?.instruction).not.toContain("Every step of that span");
  });

  // The withdraw shape: the row's Withdraw, then the dialog's confirm, which
  // the model claimed for the act. Both run on every row.
  it("repeats the whole span from the listing through the claimed step, past a listing the model withdrew", () => {
    const draftSteps = [step(1, "web.output.dom-extract_list"), step(2, "web.output.dom-extract_list", "dropped"), step(3, "web.output.dom-click"), step(4, "web.output.dom-click")];
    const suggestion = automationStudioRepeatSuggestion({ missingActs: needsRepeat("4"), draftSteps, registry, resolution });

    expect(suggestion?.amendment).toEqual({ step: 3, change: "repeat", over: 1, through: 4 });
    expect(suggestion?.instruction).toContain("steps 3 through 4 run once for every row step 1 lists");
  });

  it("suggests nothing without a listing before the claimed step, or for any other reason", () => {
    expect(automationStudioRepeatSuggestion({ missingActs: needsRepeat("d2"), draftSteps: [step(1, "web.output.browser-navigate"), step(2, "web.output.dom-click")], registry, resolution })).toBeUndefined();
    expect(automationStudioRepeatSuggestion({ missingActs: { acts: [{ id: "a1", reason: "step_not_kept", step: "d3" }] }, draftSteps: [step(2, "web.output.dom-extract_list"), step(3, "web.output.dom-click")], registry, resolution })).toBeUndefined();
  });
});
