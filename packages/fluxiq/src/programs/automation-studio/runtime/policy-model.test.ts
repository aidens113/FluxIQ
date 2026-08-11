import { describe, expect, it } from "vitest";
import type { PolicyGraph } from "../model/index.ts";
import { policyGraphToAutomationStudioFlow } from "./policy-model.ts";

describe("policy proposal Flow projection", () => {
  it("preserves reviewed node positions and does not stagger fallback nodes", () => {
    const policy: PolicyGraph = {
      schemaVersion: "0.1",
      policyId: "policy.layout",
      taskId: "task.layout",
      version: "0.1",
      sourceEvidence: [],
      nodes: [{
        id: "first",
        label: "First",
        eligibility: { type: "all", conditions: [] },
        actions: [{ id: "action.first", actionType: "output.first", outputId: "output.first", parameters: {} }],
        successConditions: { type: "all", conditions: [] },
        failureConditions: { type: "none", conditions: [] },
        timeout: { timeoutMs: 5000 },
        retry: { maxAttempts: 1, backoffMs: 500 },
        recovery: { strategy: "pause" },
        outgoingEdges: [],
        sourceEvidence: [],
        generatedMetadata: { generatedBy: "signal_miner", generatedAt: 1 },
        metadata: { position: { x: 80, y: 220 } }
      }, {
        id: "second",
        label: "Second",
        eligibility: { type: "all", conditions: [] },
        actions: [{ id: "action.second", actionType: "output.second", outputId: "output.second", parameters: {} }],
        successConditions: { type: "all", conditions: [] },
        failureConditions: { type: "none", conditions: [] },
        timeout: { timeoutMs: 5000 },
        retry: { maxAttempts: 1, backoffMs: 500 },
        recovery: { strategy: "pause" },
        outgoingEdges: [],
        sourceEvidence: [],
        generatedMetadata: { generatedBy: "signal_miner", generatedAt: 1 }
      }, {
        id: "third",
        label: "Third",
        eligibility: { type: "all", conditions: [] },
        actions: [{ id: "action.third", actionType: "output.third", outputId: "output.third", parameters: {} }],
        successConditions: { type: "all", conditions: [] },
        failureConditions: { type: "none", conditions: [] },
        timeout: { timeoutMs: 5000 },
        retry: { maxAttempts: 1, backoffMs: 500 },
        recovery: { strategy: "pause" },
        outgoingEdges: [],
        sourceEvidence: [],
        generatedMetadata: { generatedBy: "signal_miner", generatedAt: 1 }
      }],
      edges: [],
      generatedMetadata: { generatedBy: "signal_miner", generatedAt: 1 }
    };

    const flow = policyGraphToAutomationStudioFlow(policy, { flowId: "flow.layout", proposalId: "proposal.layout" });

    expect(flow.nodes[0]?.position).toEqual({ x: 80, y: 220 });
    expect(flow.nodes[1]?.position).toEqual({ x: 340, y: 160 });
    expect(flow.nodes[2]?.position).toEqual({ x: 680, y: 160 });
  });
});
