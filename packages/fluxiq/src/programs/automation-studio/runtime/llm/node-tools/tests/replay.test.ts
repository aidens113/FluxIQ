// The names a replay and a written step travel under, and the two calls a
// test pass sends: the step as it ran, or the step on one row of a repeat with
// its bindings already resolved (t252, D1 and D6).
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import {
  AUTOMATION_STUDIO_NODE_OUTPUTS_KEY,
  AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY,
  AUTOMATION_STUDIO_NODE_WRITE_KEY,
  AUTOMATION_STUDIO_NODE_WRITTEN_CODE,
  automationStudioNodeReplayStatus,
  automationStudioNodeReplayStepCall,
  automationStudioNodeReplayVerifyCall
} from "../replay.ts";

const ranWith = { node: "web.output.dom-click", parameters: { target: { handle: "t12" }, label: { $state: { path: "item.name" } } }, consequences: [] };
const step: AutomationStudioFlowDraftStep = {
  position: 1, id: "d1", iteration: 1, actionId: "web.output.dom-click", toolId: "core.run_node",
  input: ranWith, ranWith, effect: "mutate", effectApplied: true, disposition: "kept",
  replay: { from: { location: "https://a.example/" }, produced: { clicked: true } }
};

describe("the names a domain mirrors", () => {
  it("are Core's own words for writing, a pass's row, a node's outputs and the written answer", () => {
    expect(AUTOMATION_STUDIO_NODE_WRITE_KEY).toBe("write");
    expect(AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY).toBe("item");
    expect(AUTOMATION_STUDIO_NODE_OUTPUTS_KEY).toBe("outputs");
    expect(AUTOMATION_STUDIO_NODE_WRITTEN_CODE).toBe("core.run_node.written");
  });

  it("never reads the written answer as a replay that passed", () => {
    expect(automationStudioNodeReplayStatus(AUTOMATION_STUDIO_NODE_WRITTEN_CODE)).toBe("failed");
    expect(automationStudioNodeReplayStatus(AUTOMATION_STUDIO_NODE_WRITTEN_CODE, "verify")).toBe("failed");
  });
});

describe("a replay call", () => {
  it("is the step as it ran when no pass is given, exactly as before", () => {
    expect(automationStudioNodeReplayStepCall(step)).toEqual({ ...ranWith, replay: "step", from: { location: "https://a.example/" }, produced: { clicked: true } });
    expect(automationStudioNodeReplayVerifyCall(step)).toEqual({ ...ranWith, replay: "verify", from: { location: "https://a.example/" } });
    expect(automationStudioNodeReplayStepCall(step, {})).toEqual(automationStudioNodeReplayStepCall(step));
    expect(automationStudioNodeReplayVerifyCall(step, {})).toEqual(automationStudioNodeReplayVerifyCall(step));
  });

  it("carries a pass's row and its resolved parameters in place of what the step ran with", () => {
    const row = { name: "Ada", mutual: 3 };
    const parameters = { target: { handle: "t12" }, label: "Ada" };
    expect(automationStudioNodeReplayStepCall(step, { item: row, parameters })).toEqual({
      node: "web.output.dom-click", parameters, consequences: [], item: row,
      replay: "step", from: { location: "https://a.example/" }, produced: { clicked: true }
    });
    expect(automationStudioNodeReplayVerifyCall(step, { item: row, parameters })).toEqual({
      node: "web.output.dom-click", parameters, consequences: [], item: row,
      replay: "verify", from: { location: "https://a.example/" }
    });
  });

  it("takes either one alone", () => {
    expect(automationStudioNodeReplayStepCall(step, { item: { name: "Ada" } })).toMatchObject({ parameters: ranWith.parameters, item: { name: "Ada" } });
    expect(automationStudioNodeReplayVerifyCall(step, { parameters: { label: "x" } })).not.toHaveProperty("item");
    expect(automationStudioNodeReplayVerifyCall(step, { parameters: { label: "x" } })).toMatchObject({ parameters: { label: "x" } });
  });

  it("is still nothing for a step that never said what it ran with", () => {
    const { ranWith: _dropped, ...unrun } = step;
    expect(automationStudioNodeReplayStepCall(unrun, { item: { name: "Ada" } })).toBeUndefined();
    expect(automationStudioNodeReplayVerifyCall(unrun, { item: { name: "Ada" } })).toBeUndefined();
  });
});
