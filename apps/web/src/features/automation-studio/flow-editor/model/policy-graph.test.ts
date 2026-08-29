import { describe, expect, it } from "vitest";
import { legacyPolicyToFlowGraph, taskFlowToEditorGraph } from "./flow-graph";

describe("Flow graph conversion", () => {
  it("converts task-flow nodes, ports, positions, and routes", () => {
    const graph = taskFlowToEditorGraph({
      nodes: [
        { id: "start", definitionId: "builtin.control.start", position: { x: 10, y: 20 }, parameterValues: {} },
        { id: "work", definitionId: "custom.work", position: { x: 310, y: 20 }, parameterValues: { value: "ready" } }
      ],
      edges: [
        { id: "start-work", sourceNodeId: "start", targetNodeId: "work", sourcePortId: "success", targetPortId: "in", label: "Success" }
      ]
    }, "work", [{
      id: "custom.work",
      version: "1.0.0",
      label: "Work",
      inputs: [{ id: "in", label: "In", valueType: "any", role: "control" }],
      outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }],
      parameters: []
    }]);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0]?.position).toEqual({ x: 10, y: 20 });
    expect(graph.nodes[1]?.selected).toBe(true);
    expect(graph.nodes[1]?.data.label).toBe("Work");
    expect(graph.edges[0]).toMatchObject({
      id: "start-work",
      source: "start",
      target: "work",
      sourceHandle: "success",
      targetHandle: "in"
    });
  });

  it("converts generated policy conditions and route semantics", () => {
    const graph = legacyPolicyToFlowGraph({
      nodes: [
        { id: "source", isStart: true, actions: [{ actionType: "calculate" }] },
        { id: "target", successConditions: { conditions: [{ signalPath: "result.ok" }] } }
      ],
      edges: [{ id: "route", fromNodeId: "source", toNodeId: "target", label: "Success" }]
    }, "source");

    expect(graph.nodes[0]?.selected).toBe(true);
    expect(graph.nodes[0]?.data.icon).toBe("workflow");
    expect(graph.nodes[1]?.data.successCount).toBe(1);
    expect(graph.edges[0]).toMatchObject({ id: "route", source: "source", target: "target" });
  });
});