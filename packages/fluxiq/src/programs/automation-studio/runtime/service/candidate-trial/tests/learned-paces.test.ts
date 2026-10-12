import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import { automationStudioTrialLearnedPaces } from "../index.ts";

const graph = {
  metadata: { bootstrapSymbolicKey: "primary" },
  nodes: [
    { id: "node.trial.primary.confirm", definitionId: "web.output.dom-click", metadata: { bootstrapSymbolicKey: "confirm" } },
    { id: "node.trial.primary.open", definitionId: "web.output.browser-navigate", metadata: { bootstrapSymbolicKey: "open", paceMs: 2_000 } },
    { id: "node.host", definitionId: "web.output.dom-click" }
  ]
} as unknown as AutomationStudioFlowArtifact;

const trace = (pace: AutomationStudioGraphExecutionTrace["pace"]): AutomationStudioGraphExecutionTrace => ({ status: "succeeded", startedAt: 1, values: {}, effects: [], attempts: [], ...(pace ? { pace } : {}) });

describe("the paces a trial learned, by the plan's keys", () => {
  it("names each learned pace by its subflow and node key, and leaves out an authored-only pace and a node with no key", () => {
    expect(automationStudioTrialLearnedPaces(trace([
      { nodeId: "node.trial.primary.confirm", paceMs: 8_250, learnedMs: 8_250, raisedCount: 2, waitedMs: 4_000 },
      { nodeId: "node.trial.primary.open", paceMs: 2_000, authoredMs: 2_000, raisedCount: 0, waitedMs: 0 },
      { nodeId: "node.host", paceMs: 5_500, learnedMs: 5_500, raisedCount: 1, waitedMs: 0 }
    ]), graph)).toEqual([{ subflowKey: "primary", nodeKey: "confirm", paceMs: 8_250 }]);
  });

  it("is empty when the run learned nothing or the graph is not a plan's", () => {
    expect(automationStudioTrialLearnedPaces(trace(undefined), graph)).toEqual([]);
    expect(automationStudioTrialLearnedPaces(trace([{ nodeId: "node.trial.primary.confirm", paceMs: 5_500, learnedMs: 5_500, raisedCount: 1, waitedMs: 0 }]), { ...graph, metadata: {} } as AutomationStudioFlowArtifact)).toEqual([]);
  });
});
