import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../model/index.ts";
import { runAutomationStudioGraph } from "./executor.ts";

describe("Automation Studio graph executor", () => {
  it("runs built-in nodes, follows named routes, and records attempts/effects", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.test",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime test",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "sum", definitionId: "builtin.math.add", parameterValues: { precision: 0 } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.sum", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "sum", targetPortId: "in" },
        { id: "sum.end", sourceNodeId: "sum", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    };

    const trace = await runAutomationStudioGraph(flow, { inputs: { left: 2, right: 5 } });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "sum", "end"]);
    expect(trace.values.result).toBe(7);
  });

  it("fails instead of reporting success when a non-terminal node has no matching route edge", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.route-mismatch",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime route mismatch",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "sum", definitionId: "builtin.math.add", parameterValues: { precision: 0 } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
      ],
      edges: [
        { id: "start.sum", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "sum", targetPortId: "in" },
        { id: "sum.end", sourceNodeId: "sum", sourcePortId: "done", targetNodeId: "end", targetPortId: "in" }
      ]
    };

    const trace = await runAutomationStudioGraph(flow, { inputs: { left: 2, right: 5 } });

    expect(trace.status).toBe("failed");
    expect(trace.currentNodeId).toBe("sum");
    expect(trace.message).toContain("no matching outgoing edge");
    expect(trace.message).toContain("done");
  });

  it("requires an explicit End node for successful terminal completion", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.explicit-end",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime explicit end",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
      ],
      edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
    };

    const trace = await runAutomationStudioGraph(flow);

    expect(trace.status).toBe("succeeded");
    expect(trace.currentNodeId).toBe("end");
  });

  it("fails when a non-terminal node ends early with unvisited nodes remaining", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.early-stop",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime early stop",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "after", definitionId: "builtin.math.add", parameterValues: { precision: 0 } }
      ],
      edges: []
    };

    const trace = await runAutomationStudioGraph(flow);

    expect(trace.status).toBe("failed");
    expect(trace.currentNodeId).toBe("start");
    expect(trace.message).toContain("without an outgoing edge");
  });
});
