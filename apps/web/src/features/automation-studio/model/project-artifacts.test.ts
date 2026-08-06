import type { AutomationStudioFlowDocument, AutomationStudioTaskArtifact } from "fluxiq/automation-studio";
import { describe, expect, it } from "vitest";
import { flowToTaskPolicy, graphToTaskFlow, mergeById } from "./project-artifacts";

describe("Automation Studio project artifact model", () => {
  it("merges project artifacts by stable id with primary precedence", () => {
    expect(
      mergeById(
        [{ id: "one", value: "primary" }],
        [
          { id: "one", value: "secondary" },
          { id: "two", value: "new" },
        ],
        "id",
      ),
    ).toEqual([
      { id: "one", value: "primary" },
      { id: "two", value: "new" },
    ]);
  });

  it("round-trips task graph identity and exact port connections", () => {
    const task = { schemaVersion: "0.1", taskId: "task.example", name: "Example", graphId: "flow.example" } as AutomationStudioTaskArtifact;
    const flow = graphToTaskFlow({
      task,
      graph: {
        nodes: [
          { id: "start", position: { x: 10.4, y: 20.6 }, data: { isStart: true, label: "Start" } },
          { id: "step", position: { x: 350, y: 21 }, data: { label: "Step", actionTypes: ["example.run"] } },
        ],
        edges: [{ id: "edge.start.step", source: "start", target: "step", sourceHandle: "success", targetHandle: "in", label: "Continue" }],
      },
    });

    expect(flow.flowId).toBe("flow.example");
    expect(flow.nodes[0]?.position).toEqual({ x: 10, y: 21 });
    expect(flow.edges[0]).toMatchObject({ sourceNodeId: "start", targetNodeId: "step", sourcePortId: "success", targetPortId: "in" });

    const policy = flowToTaskPolicy(flow as AutomationStudioFlowDocument, task);
    expect(policy?.taskId).toBe("task.example");
    expect(policy?.nodes.find((node) => node.id === "start")?.outgoingEdges).toHaveLength(1);
  });
});
