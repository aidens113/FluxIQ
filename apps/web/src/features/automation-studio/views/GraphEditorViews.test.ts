import { describe, expect, it } from "vitest";
import { automationCompositeCallMetadata } from "./GraphEditorViews";
import { policyToReactFlowGraph, taskFlowToReactFlowGraph } from "../graph/view-model";

describe("Automation Studio composite palette nodes", () => {
  it("creates an exact pinned Call Flow configuration with explicit bindings", () => {
    expect(automationCompositeCallMetadata({ id: "composite", version: "1.2.0", label: "Child", description: "Child", family: "public-flows", scope: "both", nodeType: "custom", source: { kind: "composite", flowId: "flow.child", version: "1.2.0" }, availability: { kind: "domain", domainId: "orders" }, inputs: [{ id: "request", label: "Request", valueType: "object" }], outputs: [{ id: "result", label: "Result", valueType: "object" }, { id: "error.failed", label: "Failed", valueType: "object", role: "error" }], parameters: [] })).toMatchObject({ "fluxiq.callFlow": { target: { flowId: "flow.child", version: "1.2.0", scope: { kind: "domain", domainId: "orders" } }, inputBindings: [{ targetPortId: "request", valueKey: "request" }], outputBindings: [{ targetPortId: "result", valueKey: "result" }], errorBindings: [{ targetPortId: "failed", valueKey: "error.failed" }] } });
  });
});

describe("Automation Studio policy graph view model", () => {
  it("counts eligibility, success, and metadata evidence on generated policy nodes", () => {
    const graph = policyToReactFlowGraph({
      nodes: [{
        id: "node.submit",
        label: "Submit",
        actions: [{ actionType: "output.submit" }],
        eligibility: { type: "all", conditions: [{ signalPath: "task.status", operator: "exists" }] },
        successConditions: { type: "all", conditions: [{ signalPath: "task.status", operator: "changed" }] },
        sourceEvidence: [{ layer: "evidence_observation", artifactId: "obs.submit" }],
        metadata: { evidence: [{ layer: "recording", artifactId: "recording.one", entryId: "entry.1" }] },
        timeout: { timeoutMs: 5000 },
        recovery: { strategy: "pause" }
      }],
      edges: []
    });

    expect(graph.nodes[0]?.data).toMatchObject({
      readinessCount: 1,
      successCount: 1,
      evidenceCount: 2
    });
  });

  it("hydrates saved custom Flow nodes with dynamic parameter definitions", () => {
    const graph = taskFlowToReactFlowGraph({
      nodes: [{
        id: "send",
        definitionId: "recording.action.submit",
        label: "Submit",
        position: { x: 10, y: 20 },
        parameterValues: { parameters: { target: "confirm" } }
      }],
      edges: []
    }, "", [{
      id: "recording.action.submit",
      version: "1.0.0",
      label: "Submit",
      description: "Recorded submit output",
      category: "recording-derived",
      source: { kind: "recording", proposalId: "proposal.one" },
      availability: { kind: "global" },
      inputs: [{ id: "ready", label: "Ready", valueType: "any", role: "control" }],
      outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }],
      parameters: [{ id: "parameters", label: "Output payload", valueType: "object", defaultValue: { target: "confirm" } }]
    }]);

    expect(graph.nodes[0]?.data.parameters).toEqual([
      { id: "parameters", label: "Output payload", valueType: "object", defaultValue: { target: "confirm" } }
    ]);
    expect(graph.nodes[0]?.data.parameterValues).toMatchObject({ parameters: { target: "confirm" } });
  });
});
