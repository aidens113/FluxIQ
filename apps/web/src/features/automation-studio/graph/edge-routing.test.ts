import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { reconnectAutomationEdge } from "./edge-routing";

describe("automation edge reconnect", () => {
  it("updates only the reconnected edge and preserves its lane", () => {
    const nodes: Array<Node<{ inputs: any[]; outputs: any[] }>> = [
      { id: "a", position: { x: 0, y: 0 }, data: { inputs: [], outputs: [{ id: "success", label: "Success", valueType: "any" }] } },
      { id: "b", position: { x: 400, y: 0 }, data: { inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [] } },
      { id: "c", position: { x: 400, y: 300 }, data: { inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [] } }
    ];
    const reconnecting: Edge = {
      id: "edge-a",
      source: "a",
      target: "b",
      sourceHandle: "success",
      targetHandle: "in",
      data: { lane: 44 }
    };
    const untouched: Edge = { id: "edge-b", source: "a", target: "b" };

    const result = reconnectAutomationEdge(reconnecting, {
      source: "a",
      target: "c",
      sourceHandle: "success",
      targetHandle: "in"
    }, [reconnecting, untouched], nodes);

    expect(result[1]).toBe(untouched);
    expect(result[0]).toMatchObject({
      id: "edge-a",
      source: "a",
      target: "c",
      data: { lane: 44, siblingIndex: 0, routeIndex: 1 }
    });
  });
});
