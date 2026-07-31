import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../model";
import { runAutomationStudioGraph } from "./executor";

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
});
