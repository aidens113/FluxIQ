// How an amendment changed a subflow's outputs, when a carried proposal can
// follow it (t658, t671): renamed in order onto as many new ones or more,
// removed when nothing new takes their place, and nothing else.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapInterface } from "../../../flow-bootstrap/plan/index.ts";
import { automationStudioProjectSupervisorInterfaceChange as change } from "../index.ts";

const side = (inputs: string[], outputs: string[]): AutomationStudioFlowBootstrapInterface => ({
  inputs: inputs.map((id) => ({ id, name: id, valueType: { kind: "unknown" } })),
  outputs: outputs.map((id) => ({ id, name: id, valueType: { kind: "unknown" } }))
});

describe("a subflow's interface change a carried proposal can follow", () => {
  it("is nothing when both sides are the same, or both have no interface", () => {
    expect(change(side(["author"], ["titles"]), side(["author"], ["titles"]))).toEqual({ renamedOutputs: [], removedOutputs: [] });
    expect(change(undefined, undefined)).toEqual({ renamedOutputs: [], removedOutputs: [] });
  });

  it("renames outputs gone onto new ones, in order, and adds any beyond (t658)", () => {
    expect(change(side([], ["titles"]), side([], ["list", "count"]))).toEqual({ renamedOutputs: [{ from: "titles", to: "list" }], removedOutputs: [] });
  });

  it("removes outputs gone when nothing new takes their place (t671)", () => {
    expect(change(side(["author"], ["titles", "count"]), side(["author"], ["titles"]))).toEqual({ renamedOutputs: [], removedOutputs: ["count"] });
  });

  it("follows no change to the inputs, more outputs gone than new ones, or an interface gained or lost", () => {
    expect(change(side(["author"], ["titles"]), side([], ["titles"]))).toBeUndefined();
    expect(change(side([], ["titles"]), side(["author"], ["titles"]))).toBeUndefined();
    expect(change(side([], ["titles", "count"]), side([], ["list"]))).toBeUndefined();
    expect(change(side([], []), undefined)).toBeUndefined();
  });
});
